import { Router } from "express";
import { pool } from "../db";
import { config } from "../config";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { autoAlertAfterPrediction } from "../services/alertEngine.service";

export const mlRouter = Router();

function runPython(
  scriptRelPath: string,
  args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);
    const p = spawn("python", ["-u", scriptPath, ...args], {
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

/** POST /api/ml/train */
mlRouter.post("/train", async (_req, res) => {
  try {
    const r = await runPython("ml/scripts/train_model.py");
    if (r.code !== 0)
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
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

/**
 * POST /api/ml/predict-forecast
 * Runs prediction then automatically sends alert email if risk is High/Extreme.
 */
mlRouter.post("/predict-forecast", async (_req, res) => {
  try {
    const r = await runPython("ml/scripts/predict_forecast.py");
    if (r.code !== 0)
      return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });

    const alert = await autoAlertAfterPrediction();

    res.json({
      ok:      true,
      message: "Forecast predicted and stored",
      stdout:  r.stdout,
      alert,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/ml/predictions?limit=7&from=2026-03-01 */
mlRouter.get("/predictions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 7), 30);
    const from  = req.query.from ? String(req.query.from) : null;

    const params: any[] = [config.latitude, config.longitude, limit];
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

/**
 * POST /api/ml/run-all
 * train → test-archive → predict-forecast → auto email alert
 */
mlRouter.post("/run-all", async (_req, res) => {
  const results: Record<string, any> = {};
  try {
    const steps: Array<[string, string]> = [
      ["train",        "ml/scripts/train_model.py"],
      ["test_archive", "ml/scripts/test_with_archive.py"],
      ["predict",      "ml/scripts/predict_forecast.py"],
    ];

    for (const [key, script] of steps) {
      const r = await runPython(script);
      results[key] = { code: r.code, stdout: r.stdout.slice(-500) };
      if (r.code !== 0) {
        results[key].stderr = r.stderr;
        return res.status(500).json({ ok: false, failedStep: key, results });
      }
    }

    results["alert"] = await autoAlertAfterPrediction();

    res.json({ ok: true, message: "All ML steps completed", results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message, results });
  }
});