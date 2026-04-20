// alerts.routes.ts
// Express router for all fire risk alert operations.
// Handles manual alert triggers, daily reports, IoT fire alerts,
// alert history retrieval, and email configuration diagnostics.
// All routes are prefixed with /api/alerts via app.ts.

import { Router } from "express";
import { config } from "../config";
import { runRiskEmailAlerts, sendIoTFireAlert } from "../services/alertEngine.service";
import { sendEmailAlert } from "../services/email.service";
import { sendDailyRiskReport } from "../services/dailyReport.service";
import { pool } from "../db";

export const alertsRouter = Router();


alertsRouter.post("/run-email", async (req, res) => {
  /**
   * Manually triggers a risk alert email for the configured location.
   * Filters predictions by minRisk level and sends if any qualifying days exist.
   * Checks that predictions are present in the DB before attempting to send —
   * returns a helpful hint if the ML pipeline has not been run yet.
   *
   * Body params:
   *   minRisk : Minimum risk level to alert on (default "High")
   *   extraTo : Additional recipient addresses (optional)
   *   note    : Free-text note appended to the email body (optional)
   */
  try {
    const minRisk = (req.body?.minRisk as "High" | "Extreme") ?? "High";
    const extraTo = Array.isArray(req.body?.extraTo) ? req.body.extraTo : [];
    const iotNote = req.body?.note as string | undefined;

    // Check that at least one prediction row exists for this location before
    // trying to send — avoids sending an empty or misleading alert email
    const { rows: predRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM fire_risk_predictions
       WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE`,
      [config.latitude, config.longitude],
    ).catch(() => ({ rows: [{ cnt: "0" }] }));

    if (Number(predRows[0]?.cnt) === 0) {
      return res.json({
        ok:      true,
        sent:    false,
        message: "No predictions in database. Run ML Prediction first (Quick Actions > Run ML Prediction).",
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


alertsRouter.post("/run-extreme", async (_req, res) => {
  /**
   * Shortcut to trigger an alert only for Extreme risk days.
   * Equivalent to calling /run-email with minRisk="Extreme".
   * No request body required.
   */
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


alertsRouter.post("/daily-report", async (_req, res) => {
  /**
   * Sends the full 7-day daily summary report email regardless of risk level.
   * Called by the scheduled daily report job in app.ts at noon each day.
   * Can also be triggered manually to verify report formatting and delivery.
   */
  try {
    const result = await sendDailyRiskReport();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


alertsRouter.get("/status", async (_req, res) => {
  /**
   * Returns the current 7-day fire risk forecast for the configured location.
   * Used by the frontend dashboard to show the alert status banner and
   * determine whether the alertNeeded flag should be displayed.
   *
   * Gracefully returns an empty result if the predictions table does not
   * exist yet rather than returning a 500 error.
   */
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

    // Identify days that require action so the frontend can show the alert banner
    const highRisk = rows.filter((r) => ["High", "Extreme"].includes(r.risk_label));

    res.json({
      ok:           true,
      location:     config.locationKey,
      total:        rows.length,
      highRiskDays: highRisk.length,
      alertNeeded:  highRisk.length > 0,  // Frontend uses this flag to show/hide the alert banner
      predictions:  rows.map((r) => ({
        date:             String(r.date).slice(0, 10),             // Normalise to YYYY-MM-DD string
        risk_code:        r.risk_code,
        risk_label:       r.risk_label,
        risk_probability: Number(r.risk_probability).toFixed(3),   // Round to 3 decimal places
        model_name:       r.model_name,
      })),
    });
  } catch (e: any) {
    // Table may not exist on first run — return empty result instead of 500
    if (e.message?.includes("does not exist")) {
      return res.json({ ok: true, location: config.locationKey, total: 0, highRiskDays: 0, alertNeeded: false, predictions: [] });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});


alertsRouter.get("/history", async (req, res) => {
  /**
   * Returns the most recent alert log entries from alert_logs, newest first.
   * Used by the frontend Alerts page to show the alert history table.
   *
   * Query params:
   *   limit: Number of records to return (default 20, max 100)
   *
   * Gracefully returns an empty list if the alert_logs table does not exist yet.
   */
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
      data:  rows.map((r) => ({
        ...r,
        alert_date: new Date(r.alert_date).toISOString().slice(0, 10), // Normalise to YYYY-MM-DD string
      })),
    });
  } catch (e: any) {
    // Table may not exist before the first alert is sent — return empty list
    if (e.message?.includes("does not exist")) {
      return res.json({ ok: true, count: 0, data: [], note: "Run sql/create_tables.sql first." });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});


alertsRouter.post("/test-email", async (_req, res) => {
  /**
   * Sends a plain diagnostic email to verify SMTP configuration is working.
   * Does not require any predictions to exist in the database.
   * Logs the test send to alert_logs for audit purposes.
   */
  try {
    await sendEmailAlert(
      "Test Email — Wildfire Alert System",
      [
        "This is a test email from your Wildfire Risk Monitoring System.",
        "",
        `Location : ${config.locationKey}`,
        `Coords   : lat=${config.latitude}, lon=${config.longitude}`,
        "",
        "Van Drishti — Wildfire Risk Monitoring System",
      ].join("\n"),
    );

    // Log the test send to alert_logs so it appears in the history endpoint
    // .catch(() => {}) prevents a missing table from failing the response
    await pool.query(
      `INSERT INTO alert_logs (location_key, risk_label, alert_date, message, created_at)
       VALUES ($1, $2, CURRENT_DATE, $3, NOW())`,
      [config.locationKey, "Low", "SMTP Test email sent successfully"],
    ).catch(() => {});

    res.json({ ok: true, message: "Test email sent successfully.", to: config.smtp.to });
  } catch (e: any) {
    console.error("test-email failed:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


alertsRouter.post("/test-extreme", async (_req, res) => {
  /**
   * Sends a mock Extreme risk alert email using hardcoded test data.
   * Useful for verifying the alert email template without needing real predictions.
   * Uses today and tomorrow as mock high-risk dates at 94% and 88% confidence.
   * Logs both mock days to alert_logs so the history endpoint reflects the test.
   */
  try {
    const { buildFireAlertHtml, buildFireAlertText, sendFireAlert } = await import("../services/email.service");

    // Build two mock prediction days to populate the alert email table
    const mockDays = [
      { date: new Date().toISOString().slice(0, 10),                       risk_label: "Extreme", risk_probability: 0.94 },
      { date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), risk_label: "Extreme", risk_probability: 0.88 },
    ];

    const emailArgs = {
      location:  config.locationKey,
      latitude:  config.latitude,
      longitude: config.longitude,
      threshold: "Extreme" as const,
      highDays:  mockDays,
    };

    const result = await sendFireAlert({
      subject: `[TEST] EXTREME Fire Risk Alert — ${config.locationKey}`,
      html:    buildFireAlertHtml(emailArgs),
      text:    buildFireAlertText(emailArgs),
    });

    // Log each mock day individually so the history table shows realistic entries
    for (const day of mockDays) {
      await pool.query(
        `INSERT INTO alert_logs (location_key, risk_label, alert_date, message, created_at)
         VALUES ($1, $2, $3::date, $4, NOW())`,
        [
          config.locationKey,
          day.risk_label,
          day.date,
          `[TEST] ${day.risk_label} fire risk detected (confidence: ${(day.risk_probability * 100).toFixed(1)}%)`,
        ],
      ).catch(() => {});
    }

    res.json({ ok: true, message: "Test EXTREME alert email sent.", ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


alertsRouter.post("/test-daily-report", async (_req, res) => {
  /**
   * Triggers the same daily report function used by the noon scheduler.
   * Useful for manually verifying the daily report email format and delivery.
   * Requires real predictions to exist in the database.
   */
  try {
    const result = await sendDailyRiskReport();
    res.json({ ok: true, message: "Test daily report sent.", ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


alertsRouter.post("/iot-fire", async (req, res) => {
  /**
   * Receives a fire or smoke detection event from an IoT device and sends
   * an immediate alert email. Called directly by ESP32 firmware when its
   * local sensors cross a threshold.
   *
   * Body params (all optional — fall back to safe defaults if absent):
   *   deviceId     : Hardware identifier, e.g. "esp32_node_01"
   *   deviceName   : Human-readable device label
   *   location     : Location override (defaults to configured location key)
   *   smokePpm     : Smoke concentration in parts per million
   *   temperature  : Ambient temperature in Celsius
   *   fireDetected : true if the flame sensor triggered
   */
  try {
    const {
      deviceId     = "unknown",
      deviceName   = "IoT Sensor",
      location     = config.locationKey,
      smokePpm     = 0,
      temperature  = 0,
      fireDetected = false,
    } = req.body ?? {};

    const result = await sendIoTFireAlert({
      deviceId,
      deviceName,
      location,
      smokePpm:     Number(smokePpm),
      temperature:  Number(temperature),
      fireDetected: Boolean(fireDetected),
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


alertsRouter.get("/debug", async (_req, res) => {
  /**
   * Diagnostic endpoint that shows the current email configuration values
   * and attempts to send a test email to confirm the SMTP connection works.
   * Sensitive values (API keys, passwords) are masked in the response.
   * Returns the full error message on failure to help diagnose config issues.
   * Should be removed or protected with requireAdmin before going to production.
   */

  // Mask sensitive values so the response is safe to share in logs
  const cfg = {
    resendApiKey: config.resendApiKey ? `SET (${config.resendApiKey.slice(0, 8)}...)` : "NOT SET",
    smtpHost:     config.smtp.host || "NOT SET",
    smtpUser:     config.smtp.user || "NOT SET",
    smtpPass:     config.smtp.pass ? "SET" : "NOT SET",  // Never expose the actual password
    alertFrom:    config.smtp.from || "NOT SET",
    alertTo:      config.smtp.to   || "NOT SET",
  };

  try {
    const { sendEmailAlert } = await import("../services/email.service");
    await sendEmailAlert(
      "Debug Test — Van Drishti",
      `Config check at ${new Date().toISOString()}\nFrom: ${cfg.alertFrom}\nTo: ${cfg.alertTo}`,
    );
    res.json({ ok: true, message: "Email sent successfully.", config: cfg });
  } catch (e: any) {
    // Return the raw error message so the caller can identify the exact config problem
    res.json({
      ok:     false,
      error:  e.message,
      config: cfg,
      hint:   "Check the error message above to fix email config",
    });
  }
});