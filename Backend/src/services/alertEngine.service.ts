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

function isAboveThreshold(label: string, threshold: "High" | "Extreme"): boolean {
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
      `INSERT INTO alert_logs (location_key, risk_label, alert_date, message, created_at)
       VALUES ($1, $2, $3::date, $4, NOW())
       ON CONFLICT DO NOTHING`,
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

  const emailArgs = { location: location_key, latitude, longitude, threshold: minRisk, highDays, iotNote: args.iotNote };

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

export async function sendIoTFireAlert(args: IoTAlertArgs): Promise<AlertResult> {
  const {
    deviceId, deviceName, location, smokePpm, temperature, fireDetected,
  } = args;

  const severity = fireDetected ? " FIRE DETECTED" : smokePpm > 300 ? " EXTREME SMOKE" : " HIGH SMOKE";
  const subject  = `${severity} — IoT Sensor Alert [${location}]`;

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

  // Log to DB
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

  <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:20px;margin-bottom:16px;">
    <div style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Device Info</div>
    ${[
      ["Device",      `${deviceName} (${deviceId})`],
      ["Location",    location],
      ["Timestamp",   new Date().toLocaleString()],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="color:rgba(255,255,255,0.45);font-size:13px;">${k}</span>
        <span style="color:#fff;font-weight:600;font-size:13px;">${v}</span>
      </div>
    `).join("")}
  </div>

  <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:20px;margin-bottom:16px;">
    <div style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Sensor Readings</div>
    ${[
      ["Temperature",   `${temperature.toFixed(1)} °C`,   "#ff8c42"],
      ["Smoke (PPM)",   `${smokePpm} ppm`,                smokePpm > 300 ? "#ff4d4d" : smokePpm > 150 ? "#ff8c42" : "#F1B24A"],
      ["Fire Sensor",   fireDetected ? "TRIGGERED ⚠" : "Not triggered", fireDetected ? "#ff4d4d" : "#9DC88D"],
    ].map(([k, v, c]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="color:rgba(255,255,255,0.45);font-size:13px;">${k}</span>
        <span style="color:${c};font-weight:700;font-size:13px;">${v}</span>
      </div>
    `).join("")}
  </div>

  <div style="background:${col}12;border:1px solid ${col}35;border-radius:14px;padding:18px;">
    <div style="color:${col};font-size:14px;font-weight:700;margin-bottom:10px;">⚡ Immediate Action Required</div>
    ${fireDetected
      ? `<div style="color:rgba(255,255,255,0.7);font-size:13px;line-height:1.7;">
          1. Contact emergency services immediately<br>
          2. Evacuate nearby personnel from the area<br>
          3. Deploy fire suppression resources<br>
          4. Notify forest department & local authorities
        </div>`
      : `<div style="color:rgba(255,255,255,0.7);font-size:13px;line-height:1.7;">
          1. Investigate smoke source near sensor<br>
          2. Increase patrol frequency in the area<br>
          3. Check for unauthorized burning activities<br>
          4. Monitor sensor readings closely
        </div>`
    }
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