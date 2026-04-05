import express from "express";
import "dotenv/config";
import cors from "cors";
import { config } from "./config";
import { mlRouter } from "./routes/ml.routes";
import { weatherRouter } from "./routes/weather.routes";
import { sensorRouter } from "./routes/sensor.routes";
import { alertsRouter } from "./routes/alerts.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { syncWeatherData } from "./services/WeatherSync.service";
import { autoAlertAfterPrediction } from "./services/alertEngine.service";
import { sendDailyRiskReport } from "./services/dailyReport.service";
import { spawn } from "child_process";
import path from "path";


// ── Auto-create all required tables ───────────────────────────────────────
async function initDB(): Promise<void> {
  const { pool } = await import("./db");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_sensor_readings (
      id          SERIAL PRIMARY KEY,
      device_id   TEXT NOT NULL,
      sensor_id   TEXT NOT NULL,
      sensor_type TEXT NOT NULL,
      value       DOUBLE PRECISION NOT NULL,
      unit        TEXT,
      measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      seq         BIGINT NOT NULL DEFAULT 0,
      UNIQUE (device_id, sensor_id, seq)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_logs (
      id           SERIAL PRIMARY KEY,
      location_key TEXT NOT NULL,
      risk_label   TEXT NOT NULL,
      alert_date   DATE NOT NULL,
      message      TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (location_key, alert_date, risk_label)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_weather (
      id                SERIAL PRIMARY KEY,
      date              DATE NOT NULL,
      location_key      TEXT NOT NULL,
      latitude          DOUBLE PRECISION,
      longitude         DOUBLE PRECISION,
      temp_max          DOUBLE PRECISION,
      temp_min          DOUBLE PRECISION,
      temp_mean         DOUBLE PRECISION,
      humidity_mean     DOUBLE PRECISION,
      precipitation_sum DOUBLE PRECISION,
      wind_speed_max    DOUBLE PRECISION,
      data_source       TEXT DEFAULT 'archive',
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (date, location_key, data_source)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_weather_forecast (
      id                SERIAL PRIMARY KEY,
      date              DATE NOT NULL,
      latitude          DOUBLE PRECISION NOT NULL,
      longitude         DOUBLE PRECISION NOT NULL,
      temp_max          DOUBLE PRECISION,
      temp_min          DOUBLE PRECISION,
      temp_mean         DOUBLE PRECISION,
      humidity_mean     DOUBLE PRECISION,
      precipitation_sum DOUBLE PRECISION,
      wind_speed_max    DOUBLE PRECISION,
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (date, latitude, longitude)
    );
  `);
  console.log(" [DB] All tables ready ✅");
}

const app = express();

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman / curl
    const allowed = [
      "https://fire-risk-monitoring-system-2.onrender.com",
      config.frontendUrl,
      "http://localhost:5173",
      "http://localhost:4173",
      "http://localhost:3000",
    ];
    if (allowed.includes(origin) || origin.endsWith(".onrender.com")) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ───────────────────────────────────────────────────────────
app.get("/check", (_req, res) => {
  res.json({
    ok: true, message: "Backend running",
    environment: process.env.NODE_ENV || "development",
    frontend: config.frontendUrl,
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/weather",   weatherRouter);
app.use("/api/sensor",    sensorRouter);
app.use("/api/alerts",    alertsRouter);
app.use("/api/ml",        mlRouter);
app.use("/api/dashboard", dashboardRouter);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}` });
});

// ── Python runner ──────────────────────────────────────────────────────────
function runPython(scriptRelPath: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);
    const cmd = process.platform === "win32" ? "python" : "python3";
    const p = spawn(cmd, ["-u", scriptPath], {
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
        DATABASE_URL:  process.env.DATABASE_URL  ?? "",
        LATITUDE:      process.env.LATITUDE      ?? "28.002",
        LONGITUDE:     process.env.LONGITUDE     ?? "83.036",
        LOCATION_KEY:  process.env.LOCATION_KEY  ?? "lumbini_28.002_83.036",
        EXCEL_PATH:    process.env.EXCEL_PATH     ?? "ml/data/ForestfireData.xlsx",
        MODEL_PATH:    process.env.MODEL_PATH     ?? "ml/models/fire_risk_model_lr.joblib",
      },
      cwd: process.cwd(),
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

// ── Full ML pipeline ───────────────────────────────────────────────────────
async function runFullPipeline(label: string): Promise<void> {
  console.log(`\n${"─".repeat(50)}\n [${label}] Starting pipeline…`);
  try { await syncWeatherData(); console.log(` [${label}] ✅ Weather synced`); }
  catch (e: any) { console.error(` [${label}] ❌ Weather sync: ${e.message}`); return; }

  const train = await runPython("ml/scripts/train_model.py");
  if (train.code !== 0) { console.error(` [${label}] ❌ Train failed:\n${train.stderr}`); return; }
  console.log(` [${label}] ✅ Model trained`);

  const test = await runPython("ml/scripts/test_with_archive.py");
  if (test.code !== 0) console.warn(` [${label}] ⚠ Archive test failed (non-fatal)`);

  const predict = await runPython("ml/scripts/predict_forecast.py");
  if (predict.code !== 0) { console.error(` [${label}] ❌ Predict failed:\n${predict.stderr}`); return; }
  console.log(` [${label}] ✅ Forecast predicted`);

  const alert = await autoAlertAfterPrediction();
  console.log(alert.sent ? ` [${label}] 🔴 Alert sent — ${alert.alerts} day(s)` : ` [${label}] ✅ No alert — ${alert.message}`);
  console.log(`${"─".repeat(50)}\n`);
}

async function startupPipeline(attempt = 1): Promise<void> {
  try { await runFullPipeline("Startup"); }
  catch (e: any) {
    if (attempt < 5) { const w = attempt * 10; console.log(` [Startup] Retry ${attempt} in ${w}s…`); setTimeout(() => startupPipeline(attempt + 1), w * 1000); }
  }
}

// ── Daily report scheduler ─────────────────────────────────────────────────
function scheduleDailyReport(): void {
  function msToNoon(): number {
    const now = new Date(), next = new Date();
    next.setHours(12, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }
  function scheduleNext(): void {
    const ms = msToNoon();
    console.log(` [Daily] Next report in ${(ms / 3600000).toFixed(2)}h`);
    setTimeout(async () => {
      const r = await sendDailyRiskReport();
      console.log(r.sent ? ` [Daily] ✅ Sent | ${r.riskLevel}` : ` [Daily] ⚠ ${r.message}`);
      scheduleNext();
    }, ms);
  }
  scheduleNext();
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(config.port, "0.0.0.0", () => {
  console.log(`\n${"═".repeat(55)}`);
  console.log(` 🔥  वन दृष्टि — Fire Risk Monitoring`);
  console.log(` Backend  : https://fire-risk-monitoring-system-1.onrender.com`);
  console.log(` Frontend : https://fire-risk-monitoring-system-2.onrender.com`);
  console.log(` Port     : ${config.port}  |  Env: ${process.env.NODE_ENV}`);
  console.log(`${"═".repeat(55)}\n`);

  // Init DB tables first, then start pipeline
  initDB().then(() => {
    if (config.syncOnStart) { console.log(" [Startup] Pipeline in 5s…"); setTimeout(() => startupPipeline(), 5000); }
  }).catch((e: any) => console.error(" [DB] Init failed:", e.message));
  setInterval(() => runFullPipeline("Scheduled"), config.syncIntervalMinutes * 60 * 1000);
  scheduleDailyReport();
});