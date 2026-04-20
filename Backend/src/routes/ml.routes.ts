// ml.routes.ts
// Express router for all machine learning pipeline operations.
// Handles model training, forecast prediction, IoT-based prediction,
// metrics retrieval, and pipeline debugging endpoints.
// Admin-protected routes require the x-admin-key header via requireAdmin middleware.
// All routes are prefixed with /api/ml via app.ts.

import { requireAdmin } from "../middleware/auth.middleware";
import { Router }       from "express";
import { pool }         from "../db";
import { config }       from "../config";
import { spawn }        from "child_process";
import path             from "path";
import fs               from "fs";
import { autoAlertAfterPrediction } from "../services/alertEngine.service";

export const mlRouter = Router();


// Runs a Python ML script as a child process and returns its exit code,
// stdout, and stderr. Tries multiple Python interpreter candidates in order
// so the correct environment is used regardless of whether the server is
// running inside a venv, a system install, or an EC2 AMI with multiple
// Python versions installed.
//
// If a candidate exits with a ModuleNotFoundError it is skipped and the
// next candidate is tried, ensuring the first interpreter that has all
// required packages installed is used.
//
// Parameters:
//   scriptRelPath : Path to the script relative to Backend/ (the cwd)
//   args          : Optional additional CLI arguments passed to the script
//
// Returns:
//   A promise resolving to { code, stdout, stderr } when the script exits.
function runPython(
  scriptRelPath: string,
  args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);

    // Pass all required env vars explicitly so Python scripts receive them
    // regardless of whether they were set in the shell that started Node
    const env = {
      ...process.env,
      PYTHONIOENCODING: "utf-8",       // Ensures UTF-8 output on all platforms
      PYTHONUNBUFFERED: "1",           // Disables output buffering so logs stream in real time
      DATABASE_URL:  process.env.DATABASE_URL  ?? "",
      LATITUDE:      process.env.LATITUDE      ?? "28.002",
      LONGITUDE:     process.env.LONGITUDE     ?? "83.036",
      LOCATION_KEY:  process.env.LOCATION_KEY  ?? "lumbini_28.002_83.036",
      EXCEL_PATH:    process.env.EXCEL_PATH    ?? "ml/data/ForestfireData.xlsx",
      MODEL_PATH:    process.env.MODEL_PATH    ?? "ml/models/fire_risk_model_lr.joblib",
    };

    // Interpreter candidates tried in priority order.
    // python3 is preferred on Linux/EC2; python covers Windows and some minimal images.
    // Absolute paths are fallbacks for systems where PATH is not fully set.
    const candidates = ["python3", "python", "/usr/bin/python3", "/usr/local/bin/python3"];

    function tryNext(idx: number): void {
      if (idx >= candidates.length) {
        // All candidates exhausted — cannot run the script
        resolve({ code: 1, stdout: "", stderr: "No Python interpreter found. Tried: " + candidates.join(", ") });
        return;
      }

      const cmd = candidates[idx];

      // -u disables output buffering so stdout/stderr stream as the script runs
      const p = spawn(cmd, ["-u", scriptPath, ...args], { env, cwd: process.cwd() });
      let stdout = "", stderr = "";

      p.stdout.on("data", (d) => (stdout += d.toString()));
      p.stderr.on("data", (d) => (stderr += d.toString()));

      p.on("close", (code) => {
        if (code !== 0 && stderr.includes("ModuleNotFoundError")) {
          // This interpreter is missing required packages — try the next candidate
          console.warn(`[ML] ${cmd} missing modules, trying next`);
          tryNext(idx + 1);
        } else {
          // Script finished (success or non-module failure) — return the result
          resolve({ code: code ?? 0, stdout, stderr });
        }
      });

      // spawn itself failed (interpreter not found on PATH) — try the next candidate
      p.on("error", () => tryNext(idx + 1));
    }

    tryNext(0);
  });
}


mlRouter.get("/debug", async (_req, res) => {
  /**
   * Diagnostic endpoint that runs check_env.py and returns environment info.
   * Shows which Python interpreter was used, whether required packages are
   * installed, and whether all required ML files exist on disk.
   * Useful for diagnosing startup failures on EC2 without SSH access.
   */
  try {
    const checkScript = path.resolve(process.cwd(), "ml/scripts/check_env.py");
    const pythonCheck = await runPython("ml/scripts/check_env.py");

    res.json({
      ok:           true,
      platform:     process.platform,
      cwd:          process.cwd(),
      scriptExists: fs.existsSync(checkScript),
      pythonOutput: pythonCheck.stdout,
      pythonErrors: pythonCheck.stderr,
      files: {
        // Verify each required ML file is present so missing files are immediately visible
        train:   fs.existsSync(path.resolve(process.cwd(), "ml/scripts/train_model.py")),
        predict: fs.existsSync(path.resolve(process.cwd(), "ml/scripts/predict_forecast.py")),
        model:   fs.existsSync(path.resolve(process.cwd(), "ml/models/fire_risk_model_lr.joblib")),
        excel:   fs.existsSync(path.resolve(process.cwd(), "ml/data/ForestfireData.xlsx")),
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


mlRouter.post("/train", requireAdmin, async (_req, res) => {
  /**
   * Retrains the XGBoost fire risk classifier on the historical Excel dataset.
   * Protected by requireAdmin — requires x-admin-key header.
   * Runs ml/scripts/train_model.py and returns its stdout on success.
   * Returns 500 with stderr on failure so the caller can diagnose the issue.
   */
  try {
    console.log("[ML] Starting training");
    const r = await runPython("ml/scripts/train_model.py");
    console.log("[ML] Train exit:", r.code);

    if (r.code !== 0) {
      console.error("[ML] Train stderr:", r.stderr.slice(0, 500));
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
    }

    res.json({ ok: true, message: "Model trained successfully", stdout: r.stdout });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


mlRouter.post("/test-archive", requireAdmin, async (_req, res) => {
  /**
   * Evaluates the trained model against the historical archive dataset.
   * Protected by requireAdmin — requires x-admin-key header.
   * Runs ml/scripts/test_with_archive.py and writes results to ml/outputs/.
   */
  try {
    const r = await runPython("ml/scripts/test_with_archive.py");
    if (r.code !== 0) {
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
    }
    res.json({ ok: true, message: "Archive test completed", stdout: r.stdout });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


mlRouter.post("/predict-forecast", requireAdmin, async (_req, res) => {
  /**
   * Generates the 7-day fire risk forecast from stored weather data and
   * automatically triggers alert emails for any High or Extreme risk days.
   * Protected by requireAdmin — requires x-admin-key header.
   * Runs ml/scripts/predict_forecast.py which writes results to fire_risk_predictions.
   */
  try {
    console.log("[ML] Starting prediction");
    const r = await runPython("ml/scripts/predict_forecast.py");
    console.log("[ML] Predict exit:", r.code);

    if (r.code !== 0) {
      console.error("[ML] Predict stderr:", r.stderr.slice(0, 500));
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
    }

    // Trigger alert emails for any High or Extreme days in the new predictions
    const alert = await autoAlertAfterPrediction();
    res.json({ ok: true, message: "Forecast predicted and stored", stdout: r.stdout, alert });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


mlRouter.post("/predict-iot", requireAdmin, async (_req, res) => {
  /**
   * Generates a fire risk prediction from the latest IoT sensor readings.
   * Protected by requireAdmin — requires x-admin-key header.
   * Runs ml/scripts/predict_iot.py which reads iot_sensor_readings and writes
   * to fire_risk_predictions with model_name='xgboost_iot'.
   *
   * The Python script communicates its structured result via a JSON_RESULT:
   * prefixed line in stdout which is parsed here and included in the response.
   * Auto-triggers alert emails if the predicted risk code is High (2) or Extreme (3).
   */
  try {
    console.log("[ML] Starting IoT prediction");
    const r = await runPython("ml/scripts/predict_iot.py");
    console.log("[ML] IoT predict exit:", r.code);

    if (r.code !== 0) {
      console.error("[ML] IoT predict stderr:", r.stderr.slice(0, 500));
      return res.status(500).json({ ok: false, message: "IoT prediction failed", stderr: r.stderr, stdout: r.stdout });
    }

    // Parse the structured result from the JSON_RESULT: line in stdout.
    // All other stdout lines are unstructured logs and are ignored here.
    let prediction: Record<string, unknown> = {};
    for (const line of r.stdout.split("\n")) {
      if (line.startsWith("JSON_RESULT:")) {
        try { prediction = JSON.parse(line.replace("JSON_RESULT:", "")); } catch { /**/ }
        break;
      }
    }

    // Only trigger alert emails for High (code 2) or Extreme (code 3) predictions
    let alert = {};
    if (Number(prediction.risk_code) >= 2) {
      alert = await autoAlertAfterPrediction();
    }

    res.json({ ok: true, prediction, alert, stdout: r.stdout });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


mlRouter.get("/predictions", async (req, res) => {
  /**
   * Returns stored fire risk predictions for the configured location.
   * Supports an optional date filter and a limit parameter.
   * Gracefully returns an empty array if the predictions table does not exist yet.
   *
   * Query params:
   *   limit : Number of rows to return (default 7, max 30)
   *   from  : ISO date string — if provided, returns predictions on or after this date
   *           instead of filtering from today
   */
  try {
    const limit = Math.min(Number(req.query.limit ?? 7), 30);
    const from  = req.query.from ? String(req.query.from) : null;

    // Build the parameter list and date filter clause dynamically based on
    // whether a from date was provided — avoids two duplicate query strings
    const params: (string | number)[] = [config.latitude, config.longitude, limit];
    const dateFilter = from ? `AND date >= $4::date` : `AND date >= CURRENT_DATE`;
    if (from) params.push(from);

    const { rows } = await pool.query(
      `SELECT date, latitude, longitude, risk_code, risk_label,
              COALESCE(risk_probability, 0) AS risk_probability,
              model_name, created_at
       FROM fire_risk_predictions
       WHERE latitude=$1 AND longitude=$2 ${dateFilter}
       ORDER BY date ASC LIMIT $3`,
      params,
    );

    res.json({
      ok:       true,
      count:    rows.length,
      location: config.locationKey,
      data: rows.map(r => ({
        date:             String(r.date).slice(0, 10),          // Normalise to YYYY-MM-DD string
        risk_code:        r.risk_code,
        risk_label:       r.risk_label,
        risk_probability: Number(r.risk_probability),
        model_name:       r.model_name,
        created_at:       r.created_at,
      })),
    });
  } catch (e: any) {
    // Table may not exist before first training run — return empty array instead of 500
    if (e.message?.includes("does not exist")) {
      return res.json({ ok: true, count: 0, location: config.locationKey, data: [] });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});


mlRouter.get("/metrics", async (_req, res) => {
  /**
   * Returns the contents of ml/outputs/metrics_train.json and
   * ml/outputs/metrics_archive.json for the ML Analytics frontend page.
   * Returns null for a key if the corresponding file has not been generated yet.
   */
  try {
    // Helper that reads and parses a JSON file from ml/outputs/, returning null if absent
    const read = (f: string) => {
      const p = path.resolve(process.cwd(), "ml/outputs", f);
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : null;
    };

    res.json({
      ok:      true,
      train:   read("metrics_train.json"),    // null if training has not run yet
      archive: read("metrics_archive.json"),  // null if archive test has not run yet
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


mlRouter.post("/run-all", requireAdmin, async (_req, res) => {
  /**
   * Runs all three ML pipeline steps in sequence:
   *   1. train_model.py       — retrain classifier
   *   2. test_with_archive.py — evaluate against archive data
   *   3. predict_forecast.py  — generate 7-day forecast
   *
   * Protected by requireAdmin — requires x-admin-key header.
   * Stops at the first failure and reports which step failed along with its stderr.
   * On full success, triggers alert emails for any High or Extreme risk days.
   */
  const results: Record<string, any> = {};

  try {
    const steps: [string, string][] = [
      ["train",        "ml/scripts/train_model.py"],
      ["test_archive", "ml/scripts/test_with_archive.py"],
      ["predict",      "ml/scripts/predict_forecast.py"],
    ];

    for (const [key, script] of steps) {
      console.log(`[ML run-all] ${key}`);
      const r = await runPython(script);

      // Keep only the last 600 chars of stdout to avoid bloating the response
      results[key] = { code: r.code, stdout: r.stdout.slice(-600) };

      if (r.code !== 0) {
        // Stop the pipeline and return which step failed
        results[key].stderr = r.stderr;
        console.error(`[ML run-all] ${key} failed:`, r.stderr.slice(0, 300));
        return res.status(500).json({ ok: false, failedStep: key, results });
      }

      console.log(`[ML run-all] ${key} complete`);
    }

    // All steps succeeded — trigger alert check on the new predictions
    results["alert"] = await autoAlertAfterPrediction();
    res.json({ ok: true, message: "All ML steps completed", results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message, results });
  }
});


mlRouter.get("/test-run", async (_req, res) => {
  /**
   * Diagnostic endpoint that runs the full train and predict pipeline and
   * returns complete stdout and stderr for each step.
   * Intended for browser-based debugging on EC2 — visit the URL directly
   * to see exactly what is failing without needing SSH access.
   * Always returns HTTP 200 even on failure so the browser renders the response
   * body rather than showing a generic error page.
   * Should be removed or protected before going to production.
   */
  const log: Record<string, any> = {};

  try {
    // Log key environment values first so they appear at the top of the output
    log.env = {
      DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
      LATITUDE:     process.env.LATITUDE,
      LONGITUDE:    process.env.LONGITUDE,
      platform:     process.platform,
      cwd:          process.cwd(),
    };

    console.log("[test-run] Starting train");
    const train = await runPython("ml/scripts/train_model.py");

    // Truncate to last 1500/1000 chars to keep the response readable in a browser
    log.train = {
      code:   train.code,
      stdout: train.stdout.slice(-1500),
      stderr: train.stderr.slice(-1000),
    };

    if (train.code !== 0) {
      return res.status(200).json({ ok: false, failedAt: "train", log });
    }

    console.log("[test-run] Starting predict");
    const predict = await runPython("ml/scripts/predict_forecast.py");

    log.predict = {
      code:   predict.code,
      stdout: predict.stdout.slice(-1500),
      stderr: predict.stderr.slice(-1000),
    };

    if (predict.code !== 0) {
      return res.status(200).json({ ok: false, failedAt: "predict", log });
    }

    res.json({ ok: true, message: "Pipeline succeeded.", log });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: e.message, log });
  }
});