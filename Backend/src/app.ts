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
const ALLOWED_ORIGINS = [
  "https://fire-risk-monitoring-system-2.onrender.com", // Render frontend
  "http://localhost:5173",                               // Vite dev
  "http://localhost:4173",                               // Vite preview
  "http://localhost:3000",                               // Express dev
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman / curl / mobile
      if (ALLOWED_ORIGINS.includes(origin))     return callback(null, true);
      if (origin.endsWith(".onrender.com"))      return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ───────────────────────────────────────────────────────────
app.get("/check", (_req, res) => {
  res.json({
    ok:          true,
    message:     "Backend running",
    environment: process.env.NODE_ENV || "development",
    frontend:    config.frontendUrl,
    timestamp:   new Date().toISOString(),
  });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use("/api/weather",   weatherRouter);
app.use("/api/sensor",    sensorRouter);
app.use("/api/alerts",    alertsRouter);
app.use("/api/ml",        mlRouter);
app.use("/api/dashboard", dashboardRouter);

// ── Python runner ──────────────────────────────────────────────────────────
function runPython(
  scriptRelPath: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);
    const p = spawn("python", ["-u", scriptPath], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      cwd: process.cwd(),
    });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

// ── Full ML pipeline ───────────────────────────────────────────────────────
async function runFullPipeline(label: string): Promise<void> {
  console.log(`\n${"─".repeat(50)}`);
  console.log(` [${label}] Starting pipeline …`);

  try {
    await syncWeatherData();
    console.log(` [${label}] ✅ Weather synced`);
  } catch (err: any) {
    console.error(` [${label}] ❌ Weather sync failed: ${err.message}`);
    return;
  }

  const train = await runPython("ml/scripts/train_model.py");
  if (train.code !== 0) {
    console.error(` [${label}] ❌ Training failed:\n${train.stderr}`);
    return;
  }
  console.log(` [${label}] ✅ Model trained`);

  const test = await runPython("ml/scripts/test_with_archive.py");
  if (test.code !== 0) console.warn(` [${label}] ⚠ Archive test failed (non-fatal)`);

  const predict = await runPython("ml/scripts/predict_forecast.py");
  if (predict.code !== 0) {
    console.error(` [${label}] ❌ Prediction failed:\n${predict.stderr}`);
    return;
  }
  console.log(` [${label}] ✅ Forecast predicted`);

  const alert = await autoAlertAfterPrediction();
  if (alert.sent) {
    console.log(` [${label}] 🔴 Alert sent — ${alert.alerts} day(s)`);
  } else {
    console.log(` [${label}] ✅ No alert needed — ${alert.message}`);
  }
  console.log(`${"─".repeat(50)}\n`);
}

// ── Startup with retry ─────────────────────────────────────────────────────
async function startupPipeline(attempt = 1): Promise<void> {
  try {
    await runFullPipeline("Startup");
  } catch (err: any) {
    if (attempt < 5) {
      const wait = attempt * 10;
      console.log(` [Startup] Retry ${attempt} in ${wait}s…`);
      setTimeout(() => startupPipeline(attempt + 1), wait * 1000);
    }
  }
}

// ── Daily report scheduler ─────────────────────────────────────────────────
function scheduleDailyReport(): void {
  function msUntilNoon(): number {
    const now  = new Date();
    const next = new Date();
    next.setHours(12, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }
  function scheduleNext(): void {
    const ms = msUntilNoon();
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
  console.log(` 🔥  वन दृष्टि — Fire Risk Monitoring Backend`);
  console.log(` URL      : https://fire-risk-monitoring-system-1.onrender.com`);
  console.log(` Frontend : https://fire-risk-monitoring-system-2.onrender.com`);
  console.log(` Port     : ${config.port}`);
  console.log(` Env      : ${process.env.NODE_ENV}`);
  console.log(`${"═".repeat(55)}\n`);

  if (config.syncOnStart) {
    console.log(" [Startup] Pipeline starts in 5s…");
    setTimeout(() => startupPipeline(), 5000);
  }

  const ms = config.syncIntervalMinutes * 60 * 1000;
  console.log(` [Scheduler] Pipeline every ${config.syncIntervalMinutes} min`);
  setInterval(() => runFullPipeline("Scheduled"), ms);

  scheduleDailyReport();
});