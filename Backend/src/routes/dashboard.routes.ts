import { Router } from "express";
import { pool } from "../db";
import { config } from "../config";

export const dashboardRouter = Router();

function toNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getCondition(temp: number, hum: number, wind: number, rain: number): string {
  if (temp >= 32 && hum <= 40 && wind >= 18) return "Critical Watch";
  if (hum <= 45 && rain <= 1)                return "Dry Conditions";
  if (wind >= 20)                             return "Wind Alert";
  return "Stable";
}

function getAction(condition: string): string {
  const map: Record<string, string> = {
    "Critical Watch": "Immediate monitoring required",
    "Dry Conditions":  "Monitor closely",
    "Wind Alert":      "Check windy zones",
  };
  return map[condition] ?? "Routine monitoring";
}

function getSeverity(condition: string): string {
  const map: Record<string, string> = {
    "Critical Watch": "High",
    "Dry Conditions":  "Medium",
    "Wind Alert":      "Medium",
  };
  return map[condition] ?? "Low";
}

dashboardRouter.get("/home", async (_req, res) => {
  try {
    // ── 1. Weather archive ────────────────────────────────────────────────
    const archiveResult = await pool.query(
      `SELECT date, location_key, latitude, longitude,
              temp_mean, humidity_mean, wind_speed_max, precipitation_sum, updated_at
       FROM daily_weather
       WHERE location_key = $1 AND data_source = 'archive'
       ORDER BY date DESC LIMIT 12`,
      [config.locationKey]
    );

    const latestRows = archiveResult.rows;

    if (!latestRows.length) {
      return res.json({
        overview: {
          monitoringStatus: "No Data", lastUpdated: "Not available",
          dataSource: "Database — run Sync Now",
          temperature: 0, humidity: 0, windSpeed: 0, rainfall: 0,
          pressure: 0, activeAlerts: 0,
        },
        trends: [], readings: [], alerts: [], areas: [],
      });
    }

    const latest   = latestRows[0];
    const trendRows = [...latestRows].reverse();

    // ── 2. Latest predictions ─────────────────────────────────────────────
    let predictions: any[] = [];
    try {
      const predResult = await pool.query(
        `SELECT date, risk_code, risk_label, COALESCE(risk_probability,0) AS risk_probability
         FROM fire_risk_predictions
         WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE
         ORDER BY date ASC LIMIT 7`,
        [config.latitude, config.longitude]
      );
      predictions = predResult.rows;
    } catch {
      predictions = [];
    }

    // ── 3. Sensor readings ────────────────────────────────────────────────
    let sensorRows: any[] = [];
    try {
      const sensorResult = await pool.query(
        `SELECT DISTINCT ON (sensor_type) sensor_type, value, measured_at
         FROM iot_sensor_readings ORDER BY sensor_type, measured_at DESC`
      );
      sensorRows = sensorResult.rows;
    } catch {
      sensorRows = [];
    }

    const sensorMap: Record<string, number> = {};
    for (const row of sensorRows) {
      sensorMap[String(row.sensor_type).toLowerCase()] = toNumber(row.value);
    }

    // ── 4. Merge: sensor overrides weather ────────────────────────────────
    const temperature = sensorMap["temperature"] ?? toNumber(latest.temp_mean);
    const humidity    = sensorMap["humidity"]    ?? toNumber(latest.humidity_mean);
    const windSpeed   = sensorMap["wind"] ?? sensorMap["wind_speed"] ?? toNumber(latest.wind_speed_max);
    const rainfall    = sensorMap["rainfall"] ?? sensorMap["precipitation"] ?? toNumber(latest.precipitation_sum);

    // ── 5. Build readings ─────────────────────────────────────────────────
    const readings = latestRows.map((row) => {
      const t = toNumber(row.temp_mean);
      const h = toNumber(row.humidity_mean);
      const w = toNumber(row.wind_speed_max);
      const r = toNumber(row.precipitation_sum);
      return {
        time:        String(row.date).slice(0, 10),
        location:    row.location_key,
        temperature: t, humidity: h, windSpeed: w, rainfall: r, pressure: 0,
        status:      getCondition(t, h, w, r),
      };
    });

    const trends = trendRows.map((row) => ({
      time:        String(row.date).slice(0, 10),
      temperature: toNumber(row.temp_mean),
      humidity:    toNumber(row.humidity_mean),
      windSpeed:   toNumber(row.wind_speed_max),
    }));

    const latestCondition = getCondition(temperature, humidity, windSpeed, rainfall);

    const areas = [{
      area:           config.locationKey,
      avgTemperature: temperature,
      avgHumidity:    humidity,
      avgWindSpeed:   windSpeed,
      condition:      latestCondition,
      action:         getAction(latestCondition),
      lat:            toNumber(latest.latitude,  config.latitude),
      lng:            toNumber(latest.longitude, config.longitude),
    }];

    const alertMessages: Record<string, string> = {
      "Critical Watch": "High temperature, low humidity, and strong wind — urgent monitoring required.",
      "Dry Conditions":  "Dry environmental conditions detected in the monitored area.",
      "Wind Alert":      "Strong wind conditions detected in the monitored area.",
    };
    const alerts = latestCondition === "Stable" ? [] : [{
      time:     String(latest.date).slice(0, 10),
      type:     latestCondition,
      location: config.locationKey,
      severity: getSeverity(latestCondition),
      message:  alertMessages[latestCondition] ?? "",
    }];

    // ── 6. Build overview — use latest prediction for risk level ──────────
    const todayPred   = predictions[0];
    const riskLabel   = todayPred?.risk_label   ?? "Unknown";
    const riskProb    = todayPred ? Number(todayPred.risk_probability) : 0;

    return res.json({
      overview: {
        monitoringStatus: "Active",
        lastUpdated:  latest.updated_at
          ? new Date(latest.updated_at).toLocaleString()
          : String(latest.date).slice(0, 10),
        dataSource:   sensorRows.length > 0 ? "Database + Sensor Readings" : "Database",
        temperature,
        humidity,
        windSpeed,
        rainfall,
        pressure:     0,
        activeAlerts: alerts.length,
        // ← these are now returned so frontend can show real risk
        riskLabel,
        riskProbability: riskProb,
      },
      predictions,   // ← full 7-day predictions array
      trends,
      readings,
      alerts,
      areas,
    });

  } catch (e: any) {
    console.error("dashboard/home error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});