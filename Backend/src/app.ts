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
    const p = spawn("python", ["-u", scriptPath], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }, cwd: process.cwd(),
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

  if (config.syncOnStart) { console.log(" [Startup] Pipeline in 5s…"); setTimeout(() => startupPipeline(), 5000); }
  setInterval(() => runFullPipeline("Scheduled"), config.syncIntervalMinutes * 60 * 1000);
  scheduleDailyReport();
});