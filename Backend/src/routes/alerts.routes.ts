import { Router } from "express";
import { config } from "../config";
import { runRiskEmailAlerts, sendIoTFireAlert } from "../services/alertEngine.service";
import { sendEmailAlert } from "../services/email.service";
import { sendDailyRiskReport } from "../services/dailyReport.service";
import { pool } from "../db";

export const alertsRouter = Router();

// ── POST /api/alerts/run-email ─────────────────────────────────────────────
alertsRouter.post("/run-email", async (req, res) => {
  try {
    const minRisk = (req.body?.minRisk as "High" | "Extreme") ?? "High";
    const extraTo = Array.isArray(req.body?.extraTo) ? req.body.extraTo : [];
    const iotNote = req.body?.note as string | undefined;

    // Check predictions exist first
    const { rows: predRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM fire_risk_predictions
       WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE`,
      [config.latitude, config.longitude],
    ).catch(() => ({ rows: [{ cnt: "0" }] }));

    if (Number(predRows[0]?.cnt) === 0) {
      return res.json({
        ok:      true,
        sent:    false,
        message: "No predictions in database. Run ML Prediction first (Quick Actions → Run ML Prediction).",
        hint:    "POST /api/ml/predict-forecast",
      });
    }

    const result = await runRiskEmailAlerts({
      latitude:     config.latitude,
      longitude:    config.longitude,
      location_key: config.locationKey,
      minRisk,
      extraTo,
      iotNote,
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/alerts/run-extreme ───────────────────────────────────────────
alertsRouter.post("/run-extreme", async (_req, res) => {
  try {
    const result = await runRiskEmailAlerts({
      latitude:     config.latitude,
      longitude:    config.longitude,
      location_key: config.locationKey,
      minRisk:      "Extreme",
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/alerts/daily-report ─────────────────────────────────────────
alertsRouter.post("/daily-report", async (_req, res) => {
  try {
    const result = await sendDailyRiskReport();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/alerts/status ────────────────────────────────────────────────
alertsRouter.get("/status", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT date, risk_code, risk_label,
              COALESCE(risk_probability, 0) AS risk_probability,
              model_name, created_at
       FROM fire_risk_predictions
       WHERE latitude  = $1
         AND longitude = $2
         AND date >= CURRENT_DATE
       ORDER BY date ASC
       LIMIT 7`,
      [config.latitude, config.longitude],
    );

    const highRisk = rows.filter((r) => ["High", "Extreme"].includes(r.risk_label));

    res.json({
      ok:           true,
      location:     config.locationKey,
      total:        rows.length,
      highRiskDays: highRisk.length,
      alertNeeded:  highRisk.length > 0,
      predictions:  rows.map((r) => ({
        date:             String(r.date).slice(0, 10),
        risk_code:        r.risk_code,
        risk_label:       r.risk_label,
        risk_probability: Number(r.risk_probability).toFixed(3),
        model_name:       r.model_name,
      })),
    });
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      return res.json({ ok: true, location: config.locationKey, total: 0, highRiskDays: 0, alertNeeded: false, predictions: [] });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/alerts/history ───────────────────────────────────────────────
alertsRouter.get("/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const { rows } = await pool.query(
      `SELECT id, location_key, risk_label, alert_date, message, created_at
       FROM alert_logs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    res.json({
      ok:    true,
      count: rows.length,
      data:  rows.map((r) => ({ ...r, alert_date: String(r.alert_date).slice(0, 10) })),
    });
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      return res.json({ ok: true, count: 0, data: [], note: "Run sql/create_tables.sql first." });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/alerts/test-email ───────────────────────────────────────────
alertsRouter.post("/test-email", async (_req, res) => {
  try {
    await sendEmailAlert(
      "🧪 Test Email — Wildfire Alert System",
      [
        "This is a test email from your Wildfire Risk Monitoring System.",
        "",
        `Location : ${config.locationKey}`,
        `Coords   : lat=${config.latitude}, lon=${config.longitude}`,
        "",
        "वन दृष्टि — Wildfire Risk Monitoring System",
      ].join("\n"),
    );
    // Log to DB
    await pool.query(
      `INSERT INTO alert_logs (location_key, risk_label, alert_date, message, created_at)
       VALUES ($1, $2, CURRENT_DATE, $3, NOW())`,
      [config.locationKey, "Low", "🧪 SMTP Test email sent successfully"],
    ).catch(() => {});
    res.json({ ok: true, message: "Test email sent successfully.", to: config.smtp.to });
  } catch (e: any) {
    console.error("❌ test-email failed:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/alerts/test-extreme ─────────────────────────────────────────
alertsRouter.post("/test-extreme", async (_req, res) => {
  try {
    const { buildFireAlertHtml, buildFireAlertText, sendFireAlert } = await import("../services/email.service");
    const mockDays = [
      { date: new Date().toISOString().slice(0, 10),                             risk_label: "Extreme", risk_probability: 0.94 },
      { date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),       risk_label: "Extreme", risk_probability: 0.88 },
    ];
    const emailArgs = { location: config.locationKey, latitude: config.latitude, longitude: config.longitude, threshold: "Extreme" as const, highDays: mockDays };
    const result = await sendFireAlert({
      subject: `🔴 [TEST] EXTREME Fire Risk Alert — ${config.locationKey}`,
      html:    buildFireAlertHtml(emailArgs),
      text:    buildFireAlertText(emailArgs),
    });
    // Log each mock day to DB
    for (const day of mockDays) {
      await pool.query(
        `INSERT INTO alert_logs (location_key, risk_label, alert_date, message, created_at)
         VALUES ($1, $2, $3::date, $4, NOW())`,
        [config.locationKey, day.risk_label, day.date,
         `[TEST] ${day.risk_label} fire risk detected (confidence: ${(day.risk_probability * 100).toFixed(1)}%)`],
      ).catch(() => {});
    }
    res.json({ ok: true, message: "Test EXTREME alert email sent.", ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/alerts/test-daily-report ────────────────────────────────────
alertsRouter.post("/test-daily-report", async (_req, res) => {
  try {
    const result = await sendDailyRiskReport();
    res.json({ ok: true, message: "Test daily report sent.", ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/alerts/iot-fire ─────────────────────────────────────────────
alertsRouter.post("/iot-fire", async (req, res) => {
  try {
    const {
      deviceId    = "unknown",
      deviceName  = "IoT Sensor",
      location    = config.locationKey,
      smokePpm    = 0,
      temperature = 0,
      fireDetected = false,
    } = req.body ?? {};

    const result = await sendIoTFireAlert({
      deviceId, deviceName, location,
      smokePpm:    Number(smokePpm),
      temperature: Number(temperature),
      fireDetected: Boolean(fireDetected),
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/alerts/debug — check email config ────────────────────────────
alertsRouter.get("/debug", async (_req, res) => {
  const cfg = {
    resendApiKey:    config.resendApiKey ? `SET (${config.resendApiKey.slice(0,8)}...)` : "NOT SET",
    smtpHost:        config.smtp.host   || "NOT SET",
    smtpUser:        config.smtp.user   || "NOT SET",
    smtpPass:        config.smtp.pass   ? "SET" : "NOT SET",
    alertFrom:       config.smtp.from   || "NOT SET",
    alertTo:         config.smtp.to     || "NOT SET",
  };

  // Try sending a test email and return full error
  try {
    const { sendEmailAlert } = await import("../services/email.service");
    await sendEmailAlert(
      "🔧 Debug Test — वन दृष्टि",
      `Config check at ${new Date().toISOString()}
From: ${cfg.alertFrom}
To: ${cfg.alertTo}`
    );
    res.json({ ok: true, message: "Email sent successfully!", config: cfg });
  } catch (e: any) {
    res.json({
      ok:     false,
      error:  e.message,
      config: cfg,
      hint:   "Check the error message above to fix email config"
    });
  }
});