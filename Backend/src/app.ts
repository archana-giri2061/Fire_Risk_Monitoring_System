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
import { spawn } from "child_process";
import path from "path";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/check", (_req, res) => {
  res.json({ ok: true, message: "Backend running" });
});

app.use("/api/weather",   weatherRouter);
app.use("/api/sensor",    sensorRouter);
app.use("/api/alerts",    alertsRouter);
app.use("/api/ml",        mlRouter);
app.use("/api/dashboard", dashboardRouter);

// ── helper: run python script ──────────────────────────────────────────────
function runPython(scriptRelPath: string): Promise<{ code: number; stdout: string; stderr: string }> {
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

// ── full pipeline: sync → train → predict → alert ─────────────────────────
async function runFullPipeline(label: string): Promise<void> {
  console.log(`\n${"─".repeat(50)}`);
  console.log(` [${label}] Starting full pipeline …`);
  console.log(`${"─".repeat(50)}`);

  // 1. Sync weather data (delete old + fetch new)
  try {
    await syncWeatherData();
  } catch (err: any) {
    console.error(` [${label}] Weather sync failed: ${err.message}`);
    return; // Don't proceed if sync fails
  }

  // 2. Retrain model on fresh data
  console.log(`\n [${label}] Retraining model on fresh data …`);
  const trainResult = await runPython("ml/scripts/train_model.py");
  if (trainResult.code !== 0) {
    console.error(` [${label}] Training failed:\n${trainResult.stderr}`);
    return;
  }
  console.log(` [${label}] Model retrained successfully`);

  // 3. Test model against fresh archive data
  console.log(`\n [${label}] Testing model against archive data …`);
  const testResult = await runPython("ml/scripts/test_with_archive.py");
  if (testResult.code !== 0) {
    console.warn(`  [${label}] Archive test failed (non-fatal):\n${testResult.stderr}`);
    // Continue even if test fails
  } else {
    console.log(` [${label}] Archive test completed`);
  }

  // 4. Predict next 7 days
  console.log(`\n [${label}] Predicting next 7 days …`);
  const predictResult = await runPython("ml/scripts/predict_forecast.py");
  if (predictResult.code !== 0) {
    console.error(` [${label}] Prediction failed:\n${predictResult.stderr}`);
    return;
  }
  console.log(` [${label}] Forecast predictions stored`);

  // 5. Auto-send email alert if High/Extreme risk found
  console.log(`\n [${label}] Checking for alert conditions …`);
  const alertResult = await autoAlertAfterPrediction();
  if (alertResult.sent) {
    console.log(` [${label}] Alert email sent — ${alertResult.alerts} high-risk day(s) detected`);
  } else {
    console.log(` [${label}] No high-risk alert needed — ${alertResult.message}`);
  }

  console.log(`\n [${label}] Full pipeline completed successfully`);
  console.log(`${"─".repeat(50)}\n`);
}

// ── startup sync with retry ────────────────────────────────────────────────
async function startupPipeline(attempt = 1): Promise<void> {
  try {
    await runFullPipeline("Startup");
  } catch (error: any) {
    console.error(`Startup pipeline attempt ${attempt} failed: ${error.message}`);
    if (attempt < 5) {
      const waitSecs = attempt * 10;
      console.log(`   Retrying in ${waitSecs}s …`);
      setTimeout(() => startupPipeline(attempt + 1), waitSecs * 1000);
    } else {
      console.error("   Giving up. Use POST /api/weather/sync-all or POST /api/ml/run-all manually.");
    }
  }
}

// ── start server ───────────────────────────────────────────────────────────
app.listen(config.port, "0.0.0.0", () => {
  console.log(` Server running at http://0.0.0.0:${config.port}`);

  if (config.syncOnStart) {
    // Wait 3 seconds for server to fully start before hitting network
    setTimeout(() => startupPipeline(), 3000);
  }

  // Run full pipeline on every scheduled interval
  const intervalMs = config.syncIntervalMinutes * 60 * 1000;
  console.log(` Full pipeline scheduled every ${config.syncIntervalMinutes} minutes`);

  setInterval(async () => {
    await runFullPipeline("Scheduled");
  }, intervalMs);
});
