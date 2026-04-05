import { Router } from "express";
import { pool } from "../db";
import { config } from "../config";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { autoAlertAfterPrediction } from "../services/alertEngine.service";

export const mlRouter = Router();

// ── Python runner — tries python3 first, falls back to python ──────────────
function runPython(
  scriptRelPath: string,
  args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);

    // On Render (Linux) it's "python3", on Windows it's "python"
    const pythonCmd = process.platform === "win32" ? "python" : "python3";

    const p = spawn(pythonCmd, ["-u", scriptPath, ...args], {
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
        // Explicitly forward these so Python scripts can always read them
        DATABASE_URL:    process.env.DATABASE_URL     ?? "",
        LATITUDE:        process.env.LATITUDE         ?? "28.002",
        LONGITUDE:       process.env.LONGITUDE        ?? "83.036",
        LOCATION_KEY:    process.env.LOCATION_KEY     ?? "lumbini_28.002_83.036",
        EXCEL_PATH:      process.env.EXCEL_PATH       ?? "ml/data/ForestfireData.xlsx",
        MODEL_PATH:      process.env.MODEL_PATH       ?? "ml/models/fire_risk_model_lr.joblib",
      },
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    p.on("error", (err) => {
      // If python3 not found, try python
      if ((err as any).code === "ENOENT" && pythonCmd === "python3") {
        const p2 = spawn("python", ["-u", scriptPath, ...args], {
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
          cwd: process.cwd(),
        });
        let o2 = "", e2 = "";
        p2.stdout.on("data", (d) => (o2 += d.toString()));
        p2.stderr.on("data", (d) => (e2 += d.toString()));
        p2.on("close", (code2) => resolve({ code: code2 ?? 1, stdout: o2, stderr: e2 }));
        p2.on("error", (err2) => resolve({ code: 1, stdout: "", stderr: `python not found: ${err2.message}` }));
      } else {
        resolve({ code: 1, stdout: "", stderr: `spawn error: ${err.message}` });
      }
    });
  });
}

// ── GET /api/ml/debug — check python + packages ───────────────────────────
mlRouter.get("/debug", async (_req, res) => {
  try {
    const pythonCheck = await runPython("ml/scripts/check_env.py");
    const scriptsExist = {
      train:   fs.existsSync(path.resolve(process.cwd(), "ml/scripts/train_model.py")),
      predict: fs.existsSync(path.resolve(process.cwd(), "ml/scripts/predict_forecast.py")),
      model:   fs.existsSync(path.resolve(process.cwd(), "ml/models/fire_risk_model_lr.joblib")),
      excel:   fs.existsSync(path.resolve(process.cwd(), "ml/data/ForestfireData.xlsx")),
    };
    res.json({
      ok:           true,
      platform:     process.platform,
      cwd:          process.cwd(),
      pythonOutput: pythonCheck.stdout,
      pythonErrors: pythonCheck.stderr,
      files:        scriptsExist,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/ml/train */
mlRouter.post("/train", async (_req, res) => {
  try {
    console.log("[ML] Starting training…");
    const r = await runPython("ml/scripts/train_model.py");
    console.log("[ML] Train exit code:", r.code);
    if (r.code !== 0) {
      console.error("[ML] Train stderr:", r.stderr);
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
    }
    res.json({ ok: true, message: "Model trained successfully", stdout: r.stdout });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/ml/test-archive */
mlRouter.post("/test-archive", async (_req, res) => {
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
mlRouter.post("/predict-forecast", async (_req, res) => {
  try {
    console.log("[ML] Starting prediction…");
    const r = await runPython("ml/scripts/predict_forecast.py");
    console.log("[ML] Predict exit code:", r.code);
    if (r.code !== 0) {
      console.error("[ML] Predict stderr:", r.stderr);
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
    }
    const alert = await autoAlertAfterPrediction();
    res.json({ ok: true, message: "Forecast predicted and stored", stdout: r.stdout, alert });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/ml/predictions?limit=7&from=2026-03-01 */
mlRouter.get("/predictions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 7), 30);
    const from  = req.query.from ? String(req.query.from) : null;

    const params: (string | number)[] = [config.latitude, config.longitude, limit];
    const dateFilter = from ? `AND date >= $4::date` : `AND date >= CURRENT_DATE`;
    if (from) params.push(from);

    const { rows } = await pool.query(
      `SELECT date, latitude, longitude,
              risk_code, risk_label,
              COALESCE(risk_probability, 0) AS risk_probability,
              model_name, created_at
       FROM fire_risk_predictions
       WHERE latitude  = $1
         AND longitude = $2
         ${dateFilter}
       ORDER BY date ASC
       LIMIT $3`,
      params,
    );

    res.json({
      ok:       true,
      count:    rows.length,
      location: config.locationKey,
      data: rows.map((r) => ({
        date:             String(r.date).slice(0, 10),
        risk_code:        r.risk_code,
        risk_label:       r.risk_label,
        risk_probability: Number(r.risk_probability),
        model_name:       r.model_name,
        created_at:       r.created_at,
      })),
    });
  } catch (e: any) {
    // If table doesn't exist yet return empty
    if (e.message?.includes("does not exist")) {
      return res.json({ ok: true, count: 0, location: config.locationKey, data: [] });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/ml/metrics */
mlRouter.get("/metrics", async (_req, res) => {
  try {
    const read = (filename: string) => {
      const p = path.resolve(process.cwd(), "ml/outputs", filename);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    };
    res.json({
      ok:      true,
      train:   read("metrics_train.json"),
      archive: read("metrics_archive.json"),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/ml/run-all — train → test → predict → alert */
mlRouter.post("/run-all", async (_req, res) => {
  const results: Record<string, any> = {};
  try {
    const steps: Array<[string, string]> = [
      ["train",        "ml/scripts/train_model.py"],
      ["test_archive", "ml/scripts/test_with_archive.py"],
      ["predict",      "ml/scripts/predict_forecast.py"],
    ];

    for (const [key, script] of steps) {
      console.log(`[ML run-all] Step: ${key}`);
      const r = await runPython(script);
      results[key] = { code: r.code, stdout: r.stdout.slice(-800) };
      if (r.code !== 0) {
        results[key].stderr = r.stderr;
        console.error(`[ML run-all] ${key} failed:`, r.stderr.slice(0, 300));
        return res.status(500).json({ ok: false, failedStep: key, results });
      }
      console.log(`[ML run-all] ${key} done`);
    }

    results["alert"] = await autoAlertAfterPrediction();
    res.json({ ok: true, message: "All ML steps completed", results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message, results });
  }
});