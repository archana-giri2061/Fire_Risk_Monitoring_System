import { requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import { pool } from "../db";
import { config } from "../config";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { autoAlertAfterPrediction } from "../services/alertEngine.service";

export const mlRouter = Router();

/**
 * Run a Python script using "python3 -m runpy <script>" approach
 * This ensures the same Python environment (with installed packages) is used
 * regardless of venv vs system Python on EC2.
 */
function runPython(
  scriptRelPath: string,
  args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);
    const env = {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
      DATABASE_URL:    process.env.DATABASE_URL     ?? "",
      LATITUDE:        process.env.LATITUDE         ?? "28.002",
      LONGITUDE:       process.env.LONGITUDE        ?? "83.036",
      LOCATION_KEY:    process.env.LOCATION_KEY     ?? "lumbini_28.002_83.036",
      EXCEL_PATH:      process.env.EXCEL_PATH       ?? "ml/data/ForestfireData.xlsx",
      MODEL_PATH:      process.env.MODEL_PATH       ?? "ml/models/fire_risk_model_lr.joblib",
    };

    // Try candidates in order until one works
    const candidates = ["python3", "python", "/usr/bin/python3", "/usr/local/bin/python3"];

    function tryNext(idx: number): void {
      if (idx >= candidates.length) {
        resolve({ code: 1, stdout: "", stderr: "No Python interpreter found. Tried: " + candidates.join(", ") });
        return;
      }
      const cmd = candidates[idx];
      const p = spawn(cmd, ["-u", scriptPath, ...args], { env, cwd: process.cwd() });
      let stdout = "", stderr = "";
      p.stdout.on("data", (d) => (stdout += d.toString()));
      p.stderr.on("data", (d) => (stderr += d.toString()));
      p.on("close", (code) => {
        // If script fails due to missing module, try next Python
        if (code !== 0 && stderr.includes("ModuleNotFoundError")) {
          console.warn(`[ML] ${cmd} missing modules, trying next…`);
          tryNext(idx + 1);
        } else {
          resolve({ code: code ?? 0, stdout, stderr });
        }
      });
      p.on("error", () => tryNext(idx + 1));
    }

    tryNext(0);
  });
}

// ── GET /api/ml/debug ─────────────────────────────────────────────────────
mlRouter.get("/debug", async (_req, res) => {
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

/** POST /api/ml/train */
mlRouter.post("/train", requireAdmin, async (_req, res) => {
  try {
    console.log("[ML] Starting training…");
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

/** POST /api/ml/test-archive */
mlRouter.post("/test-archive", requireAdmin, async (_req, res) => {
  try {
    const r = await runPython("ml/scripts/test_with_archive.py");
    if (r.code !== 0)
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
    res.json({ ok: true, message: "Archive test completed", stdout: r.stdout });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/ml/predict-forecast */
mlRouter.post("/predict-forecast", requireAdmin, async (_req, res) => {
  try {
    console.log("[ML] Starting prediction…");
    const r = await runPython("ml/scripts/predict_forecast.py");
    console.log("[ML] Predict exit:", r.code);
    if (r.code !== 0) {
      console.error("[ML] Predict stderr:", r.stderr.slice(0, 500));
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
    }
    const alert = await autoAlertAfterPrediction();
    res.json({ ok: true, message: "Forecast predicted and stored", stdout: r.stdout, alert });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/ml/predict-iot */
mlRouter.post("/predict-iot", requireAdmin, async (_req, res) => {
  try {
    console.log("[ML] Starting IoT prediction…");
    const r = await runPython("ml/scripts/predict_iot.py");
    console.log("[ML] IoT predict exit:", r.code);
    if (r.code !== 0) {
      console.error("[ML] IoT predict stderr:", r.stderr.slice(0, 500));
      return res.status(500).json({ ok: false, message: "IoT prediction failed", stderr: r.stderr, stdout: r.stdout });
    }
    // Parse JSON result line from Python stdout
    let prediction: Record<string, unknown> = {};
    for (const line of r.stdout.split("\n")) {
      if (line.startsWith("JSON_RESULT:")) {
        try { prediction = JSON.parse(line.replace("JSON_RESULT:", "")); } catch { /**/ }
        break;
      }
    }
    // Auto-alert if High or Extreme risk
    let alert = {};
    if (Number(prediction.risk_code) >= 2) {
      alert = await autoAlertAfterPrediction();
    }
    res.json({ ok: true, prediction, alert, stdout: r.stdout });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/ml/predictions */
mlRouter.get("/predictions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 7), 30);
    const from  = req.query.from ? String(req.query.from) : null;
    const params: (string | number)[] = [config.latitude, config.longitude, limit];
    const dateFilter = from ? `AND date >= $4::date` : `AND date >= CURRENT_DATE`;
    if (from) params.push(from);

    const { rows } = await pool.query(
      `SELECT date, latitude, longitude, risk_code, risk_label,
              COALESCE(risk_probability,0) AS risk_probability,
              model_name, created_at
       FROM fire_risk_predictions
       WHERE latitude=$1 AND longitude=$2 ${dateFilter}
       ORDER BY date ASC LIMIT $3`,
      params,
    );
    res.json({
      ok: true, count: rows.length, location: config.locationKey,
      data: rows.map(r => ({
        date:             String(r.date).slice(0, 10),
        risk_code:        r.risk_code,
        risk_label:       r.risk_label,
        risk_probability: Number(r.risk_probability),
        model_name:       r.model_name,
        created_at:       r.created_at,
      })),
    });
  } catch (e: any) {
    if (e.message?.includes("does not exist"))
      return res.json({ ok: true, count: 0, location: config.locationKey, data: [] });
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/ml/metrics */
mlRouter.get("/metrics", async (_req, res) => {
  try {
    const read = (f: string) => {
      const p = path.resolve(process.cwd(), "ml/outputs", f);
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : null;
    };
    res.json({ ok: true, train: read("metrics_train.json"), archive: read("metrics_archive.json") });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/ml/run-all */
mlRouter.post("/run-all", requireAdmin, async (_req, res) => {
  const results: Record<string, any> = {};
  try {
    const steps: [string, string][] = [
      ["train",        "ml/scripts/train_model.py"],
      ["test_archive", "ml/scripts/test_with_archive.py"],
      ["predict",      "ml/scripts/predict_forecast.py"],
    ];
    for (const [key, script] of steps) {
      console.log(`[ML run-all] ${key}…`);
      const r = await runPython(script);
      results[key] = { code: r.code, stdout: r.stdout.slice(-600) };
      if (r.code !== 0) {
        results[key].stderr = r.stderr;
        console.error(`[ML run-all] ${key} failed:`, r.stderr.slice(0, 300));
        return res.status(500).json({ ok: false, failedStep: key, results });
      }
      console.log(`[ML run-all] ${key} ✅`);
    }
    results["alert"] = await autoAlertAfterPrediction();
    res.json({ ok: true, message: "All ML steps completed", results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message, results });
  }
});

/**
 * GET /api/ml/test-run
 * Runs full pipeline and returns complete stdout+stderr for debugging.
 * Visit this URL in browser to see exactly what's failing.
 */
mlRouter.get("/test-run", async (_req, res) => {
  const log: Record<string, any> = {};
  try {
    log.env = {
      DATABASE_URL: process.env.DATABASE_URL ? "SET ✅" : "MISSING ❌",
      LATITUDE:     process.env.LATITUDE,
      LONGITUDE:    process.env.LONGITUDE,
      platform:     process.platform,
      cwd:          process.cwd(),
    };

    console.log("[test-run] Starting train…");
    const train = await runPython("ml/scripts/train_model.py");
    log.train = { code: train.code, stdout: train.stdout.slice(-1500), stderr: train.stderr.slice(-1000) };

    if (train.code !== 0) {
      return res.status(200).json({ ok: false, failedAt: "train", log });
    }

    console.log("[test-run] Starting predict…");
    const predict = await runPython("ml/scripts/predict_forecast.py");
    log.predict = { code: predict.code, stdout: predict.stdout.slice(-1500), stderr: predict.stderr.slice(-1000) };

    if (predict.code !== 0) {
      return res.status(200).json({ ok: false, failedAt: "predict", log });
    }

    res.json({ ok: true, message: "Pipeline succeeded!", log });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: e.message, log });
  }
});
