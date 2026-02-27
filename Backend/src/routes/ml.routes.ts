import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { spawn } from "child_process";
import path from "path";

export const mlRouter = Router();

/**
 * Helper: run python script and return output
 */
function runPython(scriptRelPath: string, args: string[] = []) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    // ✅ absolute path to script
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);

    // ✅ use python.exe from PATH, no shell so spaces are safe
    const p = spawn("python", ["-u",scriptPath, ...args], {
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


/**
 * ✅ Run training
 * POST /api/ml/train
 */
mlRouter.post("/train", async (_req, res) => {
  const r = await runPython("ml/scripts/train_model.py");
  if (r.code !== 0) return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
  res.json({ ok: true, message: "Model trained", stdout: r.stdout });
});

/**
 * ✅ Test with archive
 * POST /api/ml/test-archive
 */
mlRouter.post("/test-archive", async (_req, res) => {
  const r = await runPython("ml/scripts/test_with_archive.py");
  if (r.code !== 0) return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
  res.json({ ok: true, message: "Archive test completed", stdout: r.stdout });
});

/**
 * ✅ Predict forecast and store in DB
 * POST /api/ml/predict-forecast
 */
mlRouter.post("/predict-forecast", async (_req, res) => {
  const r = await runPython("ml/scripts/predict_forecast.py");
  if (r.code !== 0) return res.status(500).json({ ok: false, stderr: r.stderr, stdout: r.stdout });
  res.json({ ok: true, message: "Forecast predicted + stored", stdout: r.stdout });
});

/**
 * ✅ Get latest stored forecast predictions (from DB)
 * GET /api/ml/predictions?limit=30
 */
mlRouter.get("/predictions", async (req, res) => {
  const limit = Number(req.query.limit ?? 7);

  const q = `
    SELECT date, latitude, longitude, risk_code, risk_label, model_name, created_at
    FROM fire_risk_predictions
    ORDER BY date ASC
    LIMIT $1
  `;
  const { rows } = await pool.query(q, [limit]);
  res.json({ ok: true, count: rows.length, data: rows });
});