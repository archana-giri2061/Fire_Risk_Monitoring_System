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

async function runFullPipeline(label: string): Promise<void> {
  console.log(`\n${"─".repeat(50)}`);
  console.log(` [${label}] Starting full pipeline …`);
  console.log(`${"─".repeat(50)}`);

  try { await syncWeatherData(); }
  catch (err: any) { console.error(` [${label}] Weather sync failed: ${err.message}`); return; }

  const trainResult = await runPython("ml/scripts/train_model.py");
  if (trainResult.code !== 0) { console.error(` [${label}] Training failed:\n${trainResult.stderr}`); return; }

  const testResult = await runPython("ml/scripts/test_with_archive.py");
  if (testResult.code !== 0) console.warn(`  [${label}] Archive test failed (non-fatal)`);

  const predictResult = await runPython("ml/scripts/predict_forecast.py");
  if (predictResult.code !== 0) { console.error(` [${label}] Prediction failed:\n${predictResult.stderr}`); return; }

  const extremeAlert = await autoAlertAfterPrediction();
  if (extremeAlert.sent) {
    console.log(` [${label}] 🔴 Alert sent — ${extremeAlert.alerts} day(s) flagged`);
  } else {
    console.log(` [${label}] No alert needed — ${extremeAlert.message}`);
  }

  console.log(`\n [${label}] Pipeline completed\n${"─".repeat(50)}\n`);
}

async function startupPipeline(attempt = 1) {
    try {
        await runFullPipeline("Startup");
    } catch (error) {
        console.error(` [Startup] Attempt ${attempt} failed:`, error?.message);
        if (attempt < 5) {
            const waitSecs = attempt * 10;
            console.log(` [Startup] Retrying in ${waitSecs}s...`);
            setTimeout(() => startupPipeline(attempt + 1), waitSecs * 1000);
        } else {
            console.error(" [Startup] All retries exhausted. Server continues without pipeline.");
        }
    }
}

// ── Daily 10:35 AM Report Scheduler ───────────────────────────────────────
function scheduleDailyReport(): void {
  function getMillisUntil1035(): number {
    const now  = new Date();
    const next = new Date();
    next.setHours(12, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  function scheduleNext(): void {
    const ms  = getMillisUntil1035();
    const hrs = (ms / 3600000).toFixed(2);
    console.log(` [Daily Report] Next report in ${hrs}h (at 12:00 PM)`);

    setTimeout(async () => {
      console.log("\n [Daily Report] Sending daily fire risk report …");
      const result = await sendDailyRiskReport();
      if (result.sent) {
        console.log(` [Daily Report] ✅ Sent | Risk: ${result.riskLevel}`);
      } else {
        console.log(` [Daily Report] ⚠️  Skipped: ${result.message}`);
      }
      scheduleNext();
    }, ms);
  }

  scheduleNext();
}

// ── Start server ───────────────────────────────────────────────────────────
app.listen(config.port, "0.0.0.0", () => {
  console.log(` Server running at http://0.0.0.0:${config.port}`);

  if (config.syncOnStart) {
        // Delay pipeline start by 15s so Render's health check passes first
        setTimeout(() => {
            startupPipeline().catch((err) => {
                console.error(" [Startup] Pipeline error (non-fatal):", err?.message);
            });
        }, 15000);
    }

  const intervalMs = config.syncIntervalMinutes * 60 * 1000;
  console.log(` Pipeline scheduled every ${config.syncIntervalMinutes} minutes`);
  setInterval(() => runFullPipeline("Scheduled"), intervalMs);

  scheduleDailyReport();
});