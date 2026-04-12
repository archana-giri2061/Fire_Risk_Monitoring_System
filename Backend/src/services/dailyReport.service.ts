import { pool } from "../db";
import { config } from "../config";
import { sendFireAlert } from "./email.service";

// ── Risk style map ──────────────────────────────────────────────────────────
const RISK_STYLE: Record<string, { color: string; bg: string; border: string; icon: string; urgency: string }> = {
  Low:      { color: "#166534", bg: "#dcfce7", border: "#16a34a", icon: "✅", urgency: "No immediate action needed." },
  Moderate: { color: "#92400e", bg: "#fef3c7", border: "#d97706", icon: "⚠️", urgency: "Monitor conditions closely." },
  High:     { color: "#9a3412", bg: "#ffedd5", border: "#ea580c", icon: "🔶", urgency: "Take precautionary measures immediately." },
  Extreme:  { color: "#7f1d1d", bg: "#fee2e2", border: "#dc2626", icon: "🔴", urgency: "EMERGENCY — Activate response teams NOW." },
};

interface PredictionRow {
  date: string;
  risk_label: string;
  risk_probability: number;
}

// ── Build the full daily report HTML email ──────────────────────────────────
function buildDailyReportHtml(predictions: PredictionRow[], location: string): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const overallWorst =
    predictions.find((p) => p.risk_label === "Extreme") ??
    predictions.find((p) => p.risk_label === "High") ??
    predictions.find((p) => p.risk_label === "Moderate") ??
    predictions[0];

  const topStyle = RISK_STYLE[overallWorst?.risk_label ?? "Low"] ?? RISK_STYLE["Low"];
  const isUrgent = ["High", "Extreme"].includes(overallWorst?.risk_label ?? "");

  const rows = predictions
    .map((p) => {
      const s = RISK_STYLE[p.risk_label] ?? RISK_STYLE["Low"];
      const prob = (p.risk_probability * 100).toFixed(1);
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827;">${p.date}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:${s.bg};color:${s.color};border:1px solid ${s.border};font-weight:700;font-size:13px;">
              ${s.icon} ${p.risk_label}
            </span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <div style="display:inline-block;width:52px;height:52px;border-radius:50%;background:${s.bg};border:3px solid ${s.border};line-height:46px;text-align:center;font-weight:800;color:${s.color};font-size:13px;">
              ${prob}%
            </div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${s.urgency}</td>
        </tr>`;
    })
    .join("");

  const urgentBanner = isUrgent
    ? `<tr>
        <td style="background:${topStyle.border};padding:18px 40px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:15px;font-weight:700;letter-spacing:0.5px;">
            ⚡ ${topStyle.urgency}
          </p>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Daily Fire Risk Report</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
  <tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0"
           style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

      <!-- HEADER -->
      <tr>
        <td style="background:${topStyle.border};padding:32px 40px;text-align:center;">
          <div style="font-size:48px;margin-bottom:8px;">🔥</div>
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;">Daily Fire Risk Report</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.88);font-size:15px;">${today}</p>
        </td>
      </tr>

      <!-- URGENT BANNER (only for High/Extreme) -->
      ${urgentBanner}

      <!-- LOCATION -->
      <tr>
        <td style="background:${topStyle.bg};padding:16px 40px;border-bottom:2px solid ${topStyle.border};">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="font-size:13px;color:${topStyle.color};font-weight:600;text-transform:uppercase;">📍 Monitored Location</span><br/>
                <span style="font-size:18px;font-weight:800;color:${topStyle.color};">${location}</span>
              </td>
              <td align="right">
                <span style="display:inline-block;padding:6px 16px;border-radius:9999px;background:${topStyle.bg};border:2px solid ${topStyle.border};color:${topStyle.color};font-weight:800;font-size:14px;">
                  ${topStyle.icon} Overall: ${overallWorst?.risk_label ?? "N/A"}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="padding:32px 40px;">
          <h2 style="margin:0 0 16px;font-size:17px;color:#111827;font-weight:700;">📅 7-Day Fire Risk Forecast</h2>
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse;margin-bottom:28px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Date</th>
                <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Risk Level</th>
                <th style="padding:10px 16px;text-align:center;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Confidence</th>
                <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Action</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          ${isUrgent ? `
          <div style="background:#fff1f2;border:2px solid #dc2626;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
            <h3 style="margin:0 0 12px;font-size:15px;color:#7f1d1d;font-weight:800;">🚨 Immediate Actions Required</h3>
            <ul style="margin:0;padding-left:20px;">
              <li style="padding:5px 0;color:#374151;font-size:14px;">Activate emergency forest fire response teams</li>
              <li style="padding:5px 0;color:#374151;font-size:14px;">Ban all open burning and fire activities immediately</li>
              <li style="padding:5px 0;color:#374151;font-size:14px;">Issue public warnings to communities near forest zones</li>
              <li style="padding:5px 0;color:#374151;font-size:14px;">Pre-position firefighting equipment in high-risk areas</li>
              <li style="padding:5px 0;color:#374151;font-size:14px;">Coordinate with local authorities and disaster management</li>
            </ul>
          </div>` : `
          <div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
            <h3 style="margin:0 0 12px;font-size:15px;color:#166534;font-weight:700;">✅ Standard Precautions</h3>
            <ul style="margin:0;padding-left:20px;">
              <li style="padding:5px 0;color:#374151;font-size:14px;">Continue regular forest patrol schedule</li>
              <li style="padding:5px 0;color:#374151;font-size:14px;">Monitor weather conditions and ML predictions daily</li>
              <li style="padding:5px 0;color:#374151;font-size:14px;">Keep firefighting equipment in ready condition</li>
              <li style="padding:5px 0;color:#374151;font-size:14px;">Remind communities about fire safety practices</li>
            </ul>
          </div>`}

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;">
            <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.6;">
              <strong>ℹ️ About this report:</strong> Automatically generated every day at 7:00 AM by the
              Wildfire Risk Monitoring System. Predictions use a Logistic Regression ML model trained on
              Open-Meteo weather data. This is an automated report — do not reply.
            </p>
          </div>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            🌲 वन दृष्टि — Wildfire Risk Monitoring System | Lumbini Forest Zone<br/>
            Lat: ${config.latitude} | Lon: ${config.longitude}
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Build plain-text version ────────────────────────────────────────────────
function buildDailyReportText(predictions: PredictionRow[], location: string): string {
  const today = new Date().toDateString();
  const lines = predictions.map(
    (p) =>
      `  • ${p.date}  |  ${p.risk_label.padEnd(8)}  |  Confidence: ${(p.risk_probability * 100).toFixed(1)}%`,
  );

  const isUrgent = predictions.some((p) => ["High", "Extreme"].includes(p.risk_label));

  return [
    `🔥 DAILY FIRE RISK REPORT — ${today}`,
    `═══════════════════════════════════════════════`,
    ``,
    `Location : ${location}`,
    `Coords   : lat=${config.latitude}, lon=${config.longitude}`,
    ``,
    `7-DAY FORECAST SUMMARY:`,
    ...lines,
    ``,
    isUrgent
      ? [
          `⚠️  HIGH/EXTREME RISK DETECTED — IMMEDIATE ACTION REQUIRED:`,
          `  • Activate emergency response teams`,
          `  • Ban all open burning immediately`,
          `  • Issue public warnings near forest zones`,
          `  • Pre-position firefighting resources`,
        ].join("\n")
      : [
          `✅ STANDARD PRECAUTIONS:`,
          `  • Continue regular patrol schedule`,
          `  • Monitor conditions daily`,
          `  • Keep equipment in ready state`,
        ].join("\n"),
    ``,
    `═══════════════════════════════════════════════`,
    `वन दृष्टि — Wildfire Risk Monitoring System`,
    `Automated daily report. Do not reply.`,
  ].join("\n");
}

// ── Main: send daily report for ALL risk levels ─────────────────────────────
export async function sendDailyRiskReport(): Promise<{
  ok: boolean;
  message?: string;
  sent?: boolean;
  riskLevel?: string;
}> {
  try {
    const { rows } = await pool.query<{
      date: Date | string;
      risk_label: string;
      risk_probability: string;
    }>(
      `SELECT date, risk_label, COALESCE(risk_probability, 0) AS risk_probability
       FROM fire_risk_predictions
       WHERE latitude  = $1
         AND longitude = $2
         AND date >= CURRENT_DATE
       ORDER BY date ASC
       LIMIT 7`,
      [config.latitude, config.longitude],
    );

    if (!rows.length) {
      console.log(" [Daily Report] No predictions available — skipping email.");
      return { ok: true, message: "No predictions found. Run /api/ml/predict-forecast first.", sent: false };
    }

    const predictions: PredictionRow[] = rows.map((r) => ({
      date: String(r.date).slice(0, 10),
      risk_label: r.risk_label,
      risk_probability: Number(r.risk_probability),
    }));

    // Find the overall worst risk to set subject
    const worstRisk =
      predictions.find((p) => p.risk_label === "Extreme")?.risk_label ??
      predictions.find((p) => p.risk_label === "High")?.risk_label ??
      predictions.find((p) => p.risk_label === "Moderate")?.risk_label ??
      "Low";

    const icon = RISK_STYLE[worstRisk]?.icon ?? "📋";
    const subject = `${icon} [Daily Report] Fire Risk Forecast — ${config.locationKey} | Overall: ${worstRisk}`;

    await sendFireAlert({
      subject,
      html: buildDailyReportHtml(predictions, config.locationKey),
      text: buildDailyReportText(predictions, config.locationKey),
    });

    // Log to DB so duplicate check works
    await pool.query(
      `INSERT INTO alert_logs (location_key, risk_label, alert_date, message, created_at)
       VALUES ($1, $2, CURRENT_DATE, $3, NOW())`,
      [config.locationKey, worstRisk,
       `Daily Report sent — Overall: ${worstRisk} risk (${predictions.length} day forecast)`],
    ).catch(() => {});

    console.log(` [Daily Report] Sent successfully | Overall risk: ${worstRisk}`);
    return { ok: true, sent: true, riskLevel: worstRisk };
  } catch (err: any) {
    console.error(" [Daily Report] Failed:", err.message);
    return { ok: false, message: err.message };
  }
}