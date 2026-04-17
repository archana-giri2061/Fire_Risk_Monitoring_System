import { pool } from "../db";
import { config } from "../config";
import {
  sendFireAlert,
  buildFireAlertHtml,
  buildFireAlertText,
  sendEmailAlert,
} from "./email.service";

// ── Risk ranking ───────────────────────────────────────────────────────────
const riskRank: Record<string, number> = {
  Low: 0, Moderate: 1, High: 2, Extreme: 3,
};

function isAboveThreshold(
  label: string,
  threshold: "High" | "Extreme"
): boolean {
  return (riskRank[label] ?? -1) >= (riskRank[threshold] ?? 2);
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface AlertDay {
  date:             string;
  risk_label:       string;
  risk_probability: number;
}

export interface AlertResult {
  ok:          boolean;
  message?:    string;
  alerts?:     number;
  sent?:       boolean;
  recipients?: string[];
  days?:       AlertDay[];
}

// ── DB logging ────────────────────────────────────────────────────────────
async function logAlertToDb(args: {
  location_key: string;
  risk_label:   string;
  date:         string;
  message:      string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO alert_logs
         (location_key, risk_label, alert_date, message, created_at)
       VALUES ($1, $2, $3::date, $4, NOW())`,
      [args.location_key, args.risk_label, args.date, args.message],
    );
  } catch {
    // Table may not exist yet — silently skip
  }
}

// ── ML forecast alert ─────────────────────────────────────────────────────
export async function runRiskEmailAlerts(args: {
  latitude?:     number;
  longitude?:    number;
  location_key?: string;
  minRisk?:      "High" | "Extreme";
  extraTo?:      string[];
  iotNote?:      string;
}): Promise<AlertResult> {
  const latitude     = args.latitude     ?? config.latitude;
  const longitude    = args.longitude    ?? config.longitude;
  const location_key = args.location_key ?? config.locationKey;
  const minRisk      = args.minRisk      ?? "High";

  const { rows } = await pool.query<{
    date:             Date | string;
    risk_label:       string;
    risk_probability: string;
  }>(
    `SELECT date, risk_label, COALESCE(risk_probability, 0) AS risk_probability
     FROM fire_risk_predictions
     WHERE latitude  = $1
       AND longitude = $2
       AND date >= CURRENT_DATE
     ORDER BY date ASC
     LIMIT 7`,
    [latitude, longitude],
  );

  if (!rows.length) {
    return {
      ok:      true,
      message: "No predictions found — run /api/ml/predict-forecast first.",
    };
  }

  const highDays: AlertDay[] = rows
    .filter((r) => isAboveThreshold(r.risk_label, minRisk))
    .map((r) => ({
      date:             String(r.date).slice(0, 10),
      risk_label:       r.risk_label,
      risk_probability: Number(r.risk_probability),
    }));

  if (!highDays.length) {
    return {
      ok:      true,
      message: `No ${minRisk.toLowerCase()}-risk days in the upcoming 7-day forecast.`,
      alerts:  0,
      sent:    false,
    };
  }

  const worstLabel =
    highDays.find((d) => d.risk_label === "Extreme")?.risk_label ??
    highDays.find((d) => d.risk_label === "High")?.risk_label ??
    minRisk;

  const subject = ` [${worstLabel} Risk] Wildfire Alert — ${location_key} (${highDays.length} day${highDays.length > 1 ? "s" : ""})`;

  const emailArgs = {
    location: location_key,
    latitude,
    longitude,
    threshold: minRisk,
    highDays,
    iotNote: args.iotNote,
  };

  const { messageId, recipients } = await sendFireAlert({
    subject,
    html:    buildFireAlertHtml(emailArgs),
    text:    buildFireAlertText(emailArgs),
    extraTo: args.extraTo,
  });

  console.log(` Alert sent | msgId=${messageId} | to=${recipients.join(", ")}`);

  for (const day of highDays) {
    await logAlertToDb({
      location_key,
      risk_label: day.risk_label,
      date:       day.date,
      message:    `${day.risk_label} fire risk detected (confidence: ${(day.risk_probability * 100).toFixed(1)}%)${args.iotNote ? " | " + args.iotNote : ""}`,
    });
  }

  return { ok: true, alerts: highDays.length, sent: true, recipients, days: highDays };
}

// ── IoT fire/smoke alert ──────────────────────────────────────────────────
export interface IoTAlertArgs {
  deviceId:     string;
  deviceName:   string;
  location:     string;
  smokePpm:     number;
  temperature:  number;
  fireDetected: boolean;
}

export async function sendIoTFireAlert(
  args: IoTAlertArgs
): Promise<AlertResult> {
  const { deviceId, deviceName, location, smokePpm, temperature, fireDetected } = args;

  const severity = fireDetected
    ? " FIRE DETECTED"
    : smokePpm > 300
    ? " EXTREME SMOKE"
    : " HIGH SMOKE";

  const subject = `${severity} — IoT Sensor Alert [${location}]`;

  const body = [
    `${severity}`,
    "",
    `Device   : ${deviceName} (${deviceId})`,
    `Location : ${location}`,
    `Timestamp: ${new Date().toISOString()}`,
    "",
    "─── Sensor Readings ───────────────────────",
    `Temperature  : ${temperature.toFixed(1)} °C`,
    `Smoke (PPM)  : ${smokePpm} ppm  ${smokePpm > 300 ? "[DANGER]" : smokePpm > 150 ? "[HIGH]" : "[ELEVATED]"}`,
    `Fire Sensor  : ${fireDetected ? "TRIGGERED ⚠" : "Not triggered"}`,
    "",
    "─── Recommended Actions ───────────────────",
    ...(fireDetected
      ? [
          "1. Contact emergency services immediately",
          "2. Evacuate nearby personnel",
          "3. Deploy fire suppression resources",
          "4. Notify forest department & local authorities",
        ]
      : [
          "1. Investigate smoke source near sensor",
          "2. Increase patrol frequency in the area",
          "3. Check for unauthorized burning activities",
          "4. Monitor sensor readings closely",
        ]),
    "",
    "─────────────────────────────────────────",
    "वन दृष्टि — Wildfire Risk Monitoring System",
    `Lumbini Forest Zone · lat=${config.latitude}, lon=${config.longitude}`,
  ].join("\n");

  const { messageId, recipients } = await sendFireAlert({
    subject,
    html:    buildIoTAlertHtml(args),
    text:    body,
    extraTo: [],
  });

  console.log(` IoT Alert sent | device=${deviceId} | msgId=${messageId}`);

  await logAlertToDb({
    location_key: location,
    risk_label:   fireDetected ? "Extreme" : "High",
    date:         new Date().toISOString().slice(0, 10),
    message:      `IoT Alert: ${severity} at ${deviceName} (smoke: ${smokePpm} ppm, temp: ${temperature.toFixed(1)}°C)`,
  });

  return {
    ok:         true,
    sent:       true,
    alerts:     1,
    recipients,
    message:    `IoT fire alert dispatched for ${deviceName}`,
  };
}

// ── Build IoT alert HTML ──────────────────────────────────────────────────
function buildIoTAlertHtml(args: IoTAlertArgs): string {
  const { deviceId, deviceName, location, smokePpm, temperature, fireDetected } = args;
  const col = fireDetected ? "#ff4d4d" : smokePpm > 300 ? "#ff4d4d" : "#ff8c42";

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>IoT Fire Alert</title></head>
<body style="background:#0d1f17;font-family:sans-serif;padding:0;margin:0;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">
  <div style="background:${col}18;border:1px solid ${col}40;border-radius:16px;padding:24px;margin-bottom:20px;">
    <div style="font-size:28px;font-weight:900;color:${col};margin-bottom:8px;">
      ${fireDetected ? "🔥 FIRE DETECTED" : "⚠️ SMOKE ALERT"}
    </div>
    <div style="color:rgba(255,255,255,0.65);font-size:14px;">IoT Sensor Emergency Alert</div>
  </div>
  <div style="margin-top:20px;text-align:center;color:rgba(255,255,255,0.25);font-size:12px;">
    वन दृष्टि — Wildfire Risk Monitoring System · Lumbini Forest Zone
  </div>
</div>
</body></html>`;
}

// ── Auto-alert after ML prediction ────────────────────────────────────────
export async function autoAlertAfterPrediction(): Promise<AlertResult> {
  try {
    console.log(" Auto-checking predictions for alert conditions …");

    // ── FIX: Check by WORST risk label today, not just any alert ──────────
    // Get the worst risk level in today's predictions
    const predCheck = await pool.query(
      `SELECT risk_label FROM fire_risk_predictions
       WHERE latitude  = $1
         AND longitude = $2
         AND date >= CURRENT_DATE
       ORDER BY
         CASE risk_label
           WHEN 'Extreme'  THEN 4
           WHEN 'High'     THEN 3
           WHEN 'Moderate' THEN 2
           ELSE 1
         END DESC
       LIMIT 1`,
      [config.latitude, config.longitude],
    ).catch(() => ({ rows: [] as any[] }));

    const todayWorstRisk = predCheck.rows[0]?.risk_label ?? null;

    // Only proceed if risk is High or Extreme
    if (
      !todayWorstRisk ||
      !isAboveThreshold(todayWorstRisk, "High")
    ) {
      console.log(
        ` Auto-alert check done — risk is ${todayWorstRisk ?? "unknown"}, no alert needed`
      );
      return {
        ok:      true,
        message: `Risk level ${todayWorstRisk} — below High threshold, no alert sent`,
        sent:    false,
      };
    }

    // ── FIX: Check duplicate by EXACT risk_label + today's date ───────────
    // This means: if High was sent today, don't send again for High
    // But if it escalates to Extreme later, a new alert CAN be sent
    const dupCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM alert_logs
       WHERE alert_date   = CURRENT_DATE
         AND location_key = $1
         AND risk_label   = $2
         AND message NOT LIKE '[TEST]%'`,
      [config.locationKey, todayWorstRisk],
    ).catch(() => ({ rows: [{ cnt: "0" }] }));

    if (Number(dupCheck.rows[0]?.cnt) > 0) {
      console.log(
        ` Auto-alert skipped — ${todayWorstRisk} alert already sent today`
      );
      return {
        ok:      true,
        message: `${todayWorstRisk} alert already sent today — skipping duplicate`,
        sent:    false,
      };
    }

    // ── No duplicate found — send alert ───────────────────────────────────
    const result = await runRiskEmailAlerts({
      latitude:     config.latitude,
      longitude:    config.longitude,
      location_key: config.locationKey,
      minRisk:      "High",
    });

    if (result.sent) {
      console.log(` Auto-alert sent | ${result.alerts} high-risk day(s)`);
    } else {
      console.log(` Auto-alert check done — ${result.message}`);
    }

    return result;
  } catch (err: any) {
    console.error(" Auto-alert failed (non-fatal):", err.message);
    return { ok: false, message: err.message };
  }
}