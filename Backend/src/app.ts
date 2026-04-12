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
      created_at   TIMESTAMPTZ DEFAULT NOW()
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
  // Remove UNIQUE constraint from alert_logs so every alert is stored
  await pool.query(`
    ALTER TABLE alert_logs DROP CONSTRAINT IF EXISTS alert_logs_location_key_alert_date_risk_label_key
  `).catch(() => {});
  console.log(" [DB] All tables ready ✅");
}

const app = express();

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Postman / curl
    const allowed = [
      
      config.frontendUrl,
      "http://localhost:5173",
      "http://localhost:4173",
      "http://localhost:3000",
      "http://<YOUR-EC2-ELASTIC-IP>",
    ];
    if (allowed.includes(origin)) return cb(null, true);
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

// ── DB Status endpoint ────────────────────────────────────────────────────
app.get("/api/db-status", async (_req, res) => {
  try {
    const { pool } = await import("./db");

    // Check each table
    const tables = [
      "daily_weather",
      "daily_weather_forecast",
      "fire_risk_predictions",
      "iot_sensor_readings",
      "alert_logs",
    ];

    const result: Record<string, any> = {};

    for (const table of tables) {
      try {
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_row
           FROM ${table}` 
        );
        result[table] = {
          exists: true,
          rows:   Number(r.rows[0].cnt),
          latest: r.rows[0].last_row ?? "n/a",
        };
      } catch {
        try {
          // Some tables use different timestamp column
          const r2 = await pool.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
          result[table] = { exists: true, rows: Number(r2.rows[0].cnt), latest: "n/a" };
        } catch {
          result[table] = { exists: false, rows: 0 };
        }
      }
    }

    // Latest sensor readings per device
    let sensorSummary: any[] = [];
    try {
      const sr = await pool.query(`
        SELECT device_id, sensor_type, value, unit, measured_at
        FROM iot_sensor_readings
        ORDER BY measured_at DESC
        LIMIT 20
      `);
      sensorSummary = sr.rows;
    } catch { /**/ }

    // Latest predictions
    let predictions: any[] = [];
    try {
      const pr = await pool.query(`
        SELECT date, risk_label, risk_probability, created_at
        FROM fire_risk_predictions
        ORDER BY date DESC
        LIMIT 7
      `);
      predictions = pr.rows;
    } catch { /**/ }

    // Latest weather
    let weather: any[] = [];
    try {
      const wr = await pool.query(`
        SELECT date, temp_mean, humidity_mean, wind_speed_max, data_source
        FROM daily_weather
        ORDER BY date DESC
        LIMIT 5
      `);
      weather = wr.rows;
    } catch { /**/ }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      tables: result,
      latest_sensor_readings: sensorSummary,
      latest_predictions: predictions,
      latest_weather: weather,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
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

// ── Sync weather + update predictions only (no email) ─────────────────────
async function syncAndPredict(label: string): Promise<void> {
  console.log(`\n${"─".repeat(50)}\n [${label}] Syncing weather & predictions…`);
  try { await syncWeatherData(); console.log(` [${label}] ✅ Weather synced`); }
  catch (e: any) { console.error(` [${label}] ❌ Weather sync: ${e.message}`); return; }

  const train = await runPython("ml/scripts/train_model.py");
  if (train.code !== 0) { console.error(` [${label}] ❌ Train failed:\n${train.stderr}`); return; }
  console.log(` [${label}] ✅ Model trained`);

  const predict = await runPython("ml/scripts/predict_forecast.py");
  if (predict.code !== 0) { console.error(` [${label}] ❌ Predict failed:\n${predict.stderr}`); return; }
  console.log(` [${label}] ✅ Forecast predicted — no auto email`);
  console.log(`${"─".repeat(50)}\n`);
}

// ── Daily report — sends at 12:00 PM, catches up if server was down ────────
async function runDailyReport(): Promise<void> {
  const { pool } = await import("./db");

  // Check if today's daily report was already sent
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM alert_logs
     WHERE alert_date = $1
       AND location_key = $2
       AND message LIKE '%Daily Report%'`,
    [today, config.locationKey],
  ).catch(() => ({ rows: [{ cnt: "0" }] }));

  if (Number(rows[0]?.cnt) > 0) {
    console.log(" [Daily] Report already sent today — skipping");
    return;
  }

  console.log(" [Daily] Sending daily report…");
  const r = await sendDailyRiskReport();
  console.log(r.sent ? ` [Daily] ✅ Sent | ${r.riskLevel}` : ` [Daily] ⚠ ${r.message}`);
}

// ── Daily report scheduler — fires at 12:00 PM every day ──────────────────
function scheduleDailyReport(): void {
  function msToNoon(): number {
    const now = new Date(), next = new Date();
    next.setHours(12, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }
  function scheduleNext(): void {
    const ms = msToNoon();
    console.log(` [Daily] Next report scheduled in ${(ms / 3600000).toFixed(2)}h`);
    setTimeout(async () => {
      await runDailyReport();
      scheduleNext();
    }, ms);
  }
  scheduleNext();
}

// ── Startup — only sync data + catch up missed daily report ───────────────
async function onStartup(): Promise<void> {
  console.log("\n [Startup] Initialising — syncing weather & predictions…");
  await syncAndPredict("Startup").catch((e: any) =>
    console.error(" [Startup] Sync error (non-fatal):", e.message)
  );

  // If it's past noon and today's daily report hasn't been sent yet, send it now
  const hour = new Date().getHours();
  if (hour >= 12) {
    console.log(" [Startup] Past noon — checking if daily report was missed…");
    await runDailyReport().catch((e: any) =>
      console.error(" [Startup] Daily report error (non-fatal):", e.message)
    );
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(config.port, "0.0.0.0", () => {
  console.log(`\n${"═".repeat(55)}`);
  console.log(` 🔥  वन दृष्टि — Fire Risk Monitoring`);
  console.log(` Backend  : http://<YOUR-EC2-IP>`);
  console.log(` Frontend : http://<YOUR-EC2-IP>`);
  console.log(` Port     : ${config.port}  |  Env: ${process.env.NODE_ENV}`);
  console.log(`${"═".repeat(55)}\n`);

  initDB().then(() => {
    // Sync data on startup — NO auto email
    setTimeout(() => onStartup(), 5000);
    // Re-sync weather + predictions every 30 min — NO email
    setInterval(() => syncAndPredict("Scheduled"), config.syncIntervalMinutes * 60 * 1000);
    // Daily report at 12:00 PM only
    scheduleDailyReport();
  }).catch((e: any) => console.error(" [DB] Init failed:", e.message));
});