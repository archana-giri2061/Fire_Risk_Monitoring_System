import { Router } from "express";
import { config } from "../config";
import { runRiskEmailAlerts } from "../services/alertEngine.service";

export const alertsRouter = Router();

alertsRouter.post("/run-email", async (_req, res) => {
  try {
    const result = await runRiskEmailAlerts({
      latitude: config.latitude,
      longitude: config.longitude,
      location_key: config.locationKey,
      minRisk: "High",
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});