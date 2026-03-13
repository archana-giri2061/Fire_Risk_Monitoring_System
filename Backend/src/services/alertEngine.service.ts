import { pool } from "../db";
import { sendEmailAlert } from "./email.service";

const riskRank: Record<string, number> = {
  Low: 0,
  Moderate: 1,
  High: 2,
  Extreme: 3,
};

function isAboveThreshold(label: string, threshold: "High" | "Extreme") {
  return (riskRank[label] ?? -1) >= (riskRank[threshold] ?? 2);
}

export async function runRiskEmailAlerts(args: {
  latitude: number;
  longitude: number;
  location_key: string;
  minRisk?: "High" | "Extreme";
}) {
  const minRisk = args.minRisk ?? "High";

  const predRes = await pool.query(
    `
    SELECT date, risk_label, COALESCE(risk_probability, 0) AS risk_probability
    FROM fire_risk_predictions
    WHERE latitude = $1
      AND longitude = $2
      AND date >= CURRENT_DATE
    ORDER BY date ASC
    LIMIT 7
    `,
    [args.latitude, args.longitude],
  );

  const highDays = predRes.rows.filter((r) => isAboveThreshold(r.risk_label, minRisk));

  if (highDays.length === 0) {
    return { ok: true, message: "No high risk days found." };
  }

  const body = highDays
    .map(
      (d) =>
        `Date: ${String(d.date).slice(0, 10)} | Risk: ${d.risk_label} | Probability: ${Number(d.risk_probability).toFixed(2)}`,
    )
    .join("\n");

  const subject = `🔥 Fire Risk Alert - ${args.location_key}`;

  await sendEmailAlert(
    subject,
    `High fire-risk days detected for ${args.location_key}.\n\n${body}\n\nPlease take precautionary action.`,
  );

  return {
    ok: true,
    alerts: highDays.length,
    sent: true,
  };
}