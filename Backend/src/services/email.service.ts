import { config } from "../config";

// ── Risk styling ────────────────────────────────────────────────────────────

interface RiskStyle {
  color:  string;
  bg:     string;
  border: string;
  icon:   string;
}

const RISK_STYLE: Record<string, RiskStyle> = {
  Low:      { color: "#166534", bg: "#dcfce7", border: "#16a34a", icon: "✅"  },
  Moderate: { color: "#92400e", bg: "#fef3c7", border: "#d97706", icon: "⚠️" },
  High:     { color: "#9a3412", bg: "#ffedd5", border: "#ea580c", icon: "🔶" },
  Extreme:  { color: "#7f1d1d", bg: "#fee2e2", border: "#dc2626", icon: "🔴" },
};

// ── Types ───────────────────────────────────────────────────────────────────

interface AlertDay {
  date:             string;
  risk_label:       string;
  risk_probability: number;
}

interface BuildEmailArgs {
  location:  string;
  latitude:  number;
  longitude: number;
  threshold: string;
  highDays:  AlertDay[];
}

export interface SendAlertArgs {
  subject:  string;
  html:     string;
  text:     string;
  extraTo?: string[];
}

// ── Resend HTTP sender ──────────────────────────────────────────────────────

async function sendViaResend(
  to: string[],
  subject: string,
  text: string,
  html?: string,
): Promise<{ messageId: string; recipients: string[] }> {
  if (!config.resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it in the Render environment variables.",
    );
  }
  if (!config.smtp.to) {
    throw new Error("ALERT_TO_EMAIL is not set in environment variables.");
  }

  const payload: Record<string, unknown> = {
    from:    config.smtp.from || "onboarding@resend.dev",
    to,
    subject,
    text,
  };
  if (html) payload.html = html;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${config.resendApiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { id?: string };
  return { messageId: data.id ?? "", recipients: to };
}

// ── Public API (same signatures as before — callers unchanged) ─────────────

export async function sendFireAlert(args: SendAlertArgs) {
  const allTo = Array.from(
    new Set([config.smtp.to, ...(args.extraTo ?? [])]),
  ).filter(Boolean);

  return sendViaResend(allTo, args.subject, args.text, args.html);
}

export async function sendEmailAlert(subject: string, message: string) {
  return sendViaResend([config.smtp.to], subject, message);
}

// ── HTML / text builders (unchanged) ───────────────────────────────────────

export function buildFireAlertHtml(args: BuildEmailArgs): string {
  const { location, latitude, longitude, threshold, highDays } = args;

  const worstLabel =
    highDays.find((d) => d.risk_label === "Extreme")?.risk_label ??
    highDays.find((d) => d.risk_label === "High")?.risk_label ??
    threshold;

  const style: RiskStyle = RISK_STYLE[worstLabel] ?? RISK_STYLE["High"];

  const dayRows = highDays
    .map((d) => {
      const s: RiskStyle = RISK_STYLE[d.risk_label] ?? RISK_STYLE["High"];
      const prob = (d.risk_probability * 100).toFixed(1);
      return `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;">${d.date}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:${s.bg};color:${s.color};border:1px solid ${s.border};font-weight:700;font-size:13px;">
              ${s.icon} ${d.risk_label}
            </span>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <div style="display:inline-block;width:52px;height:52px;border-radius:50%;background:${s.bg};border:3px solid ${s.border};line-height:46px;text-align:center;font-weight:800;color:${s.color};font-size:13px;">
              ${prob}%
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const tips =
    worstLabel === "Extreme"
      ? [
          "Activate emergency response teams immediately",
          "Ban all open burning and fire activities",
          "Issue public evacuation warnings if needed",
          "Pre-position firefighting equipment in high-risk zones",
          "Maintain continuous monitoring every hour",
        ]
      : [
          "Increase patrol frequency in forest areas",
          "Prohibit open burning and agricultural burning",
          "Ensure water sources are accessible for firefighting",
          "Alert local communities and forest officials",
          "Monitor weather conditions closely",
        ];

  const tipsHtml = tips
    .map((t) => `<li style="padding:6px 0;color:#374151;font-size:14px;">${t}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Wildfire Risk Alert</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        <tr>
          <td style="background:${style.border};padding:32px 40px;text-align:center;">
            <div style="font-size:48px;margin-bottom:8px;">🔥</div>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;">Wildfire Risk Alert</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.88);font-size:15px;">${style.icon} ${worstLabel} Risk Level Detected</p>
          </td>
        </tr>
        <tr>
          <td style="background:${style.bg};padding:16px 40px;border-bottom:2px solid ${style.border};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:13px;color:${style.color};font-weight:600;text-transform:uppercase;">📍 Monitored Location</span><br/>
                  <span style="font-size:18px;font-weight:800;color:${style.color};">${location}</span>
                </td>
                <td align="right" style="font-size:12px;color:${style.color};opacity:0.8;">
                  Lat: ${latitude}<br/>Lon: ${longitude}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 20px;color:#111827;font-size:15px;line-height:1.6;">
              Our wildfire risk monitoring system has detected
              <strong style="color:${style.color};">${highDays.length} high-risk day(s)</strong>
              in the upcoming 7-day forecast.
            </p>
            <h2 style="margin:0 0 12px;font-size:16px;color:#111827;font-weight:700;">📊 Forecast Risk Summary</h2>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse;margin-bottom:28px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Date</th>
                  <th style="padding:10px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Risk Level</th>
                  <th style="padding:10px 16px;text-align:center;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Confidence</th>
                </tr>
              </thead>
              <tbody>${dayRows}</tbody>
            </table>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
              <h3 style="margin:0 0 12px;font-size:15px;color:#111827;font-weight:700;">✅ Recommended Actions</h3>
              <ul style="margin:0;padding-left:20px;">${tipsHtml}</ul>
            </div>
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.6;">
                <strong>ℹ️ About this alert:</strong> Auto-generated by Wildfire Risk Monitoring System
                using ML predictions based on Open-Meteo weather data. Threshold: <strong>${threshold}+</strong>.
              </p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              🌿 Wildfire Risk Monitoring System | Powered by XGBoost ML + Open-Meteo API<br/>
              This is an automated alert. Do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildFireAlertText(args: BuildEmailArgs): string {
  const { location, latitude, longitude, threshold, highDays } = args;
  const lines = highDays.map(
    (d) =>
      `  • ${d.date}  |  Risk: ${d.risk_label}  |  Confidence: ${(d.risk_probability * 100).toFixed(1)}%`,
  );
  return [
    "🔥 WILDFIRE RISK ALERT",
    "═══════════════════════════════════════",
    "",
    `Location : ${location}`,
    `Coords   : lat=${latitude}, lon=${longitude}`,
    `Threshold: ${threshold}+`,
    "",
    `HIGH-RISK DAYS DETECTED (${highDays.length}):`,
    ...lines,
    "",
    "RECOMMENDED ACTIONS:",
    "  • Increase patrol frequency in forest areas",
    "  • Prohibit open burning and agricultural fires",
    "  • Alert local communities and forest officials",
    "  • Ensure firefighting water sources are accessible",
    "  • Monitor weather conditions continuously",
    "",
    "═══════════════════════════════════════",
    "Wildfire Risk Monitoring System",
    "Powered by XGBoost ML + Open-Meteo API",
    "This is an automated alert. Do not reply.",
  ].join("\n");
}