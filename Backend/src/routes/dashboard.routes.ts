import { Router } from "express";
import { pool } from "../db";
import { config } from "../config";

export const dashboardRouter = Router();

function toNum(v: any, fb = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}
function condition(t: number, h: number, w: number, r: number): string {
  if (t >= 32 && h <= 40 && w >= 18) return "Critical Watch";
  if (h <= 45 && r <= 1)              return "Dry Conditions";
  if (w >= 20)                        return "Wind Alert";
  return "Stable";
}
function action(c: string): string {
  return ({ "Critical Watch": "Immediate monitoring required", "Dry Conditions": "Monitor closely", "Wind Alert": "Check windy zones" } as any)[c] ?? "Routine monitoring";
}
function severity(c: string): string {
  return ({ "Critical Watch": "High", "Dry Conditions": "Medium", "Wind Alert": "Medium" } as any)[c] ?? "Low";
}

dashboardRouter.get("/home", async (_req, res) => {
  try {
    // ── 1. Weather archive ─────────────────────────────────────────────────
    const archiveRes = await pool.query(
      `SELECT date, location_key, latitude, longitude,
              temp_mean, humidity_mean, wind_speed_max, precipitation_sum, updated_at
       FROM daily_weather
       WHERE location_key=$1 AND data_source='archive'
       ORDER BY date DESC LIMIT 12`,
      [config.locationKey],
    );
    const rows = archiveRes.rows;

    if (!rows.length) {
      return res.json({
        overview: { monitoringStatus: "No Data", lastUpdated: "Not available", dataSource: "Run Sync Now", temperature: 0, humidity: 0, windSpeed: 0, rainfall: 0, pressure: 0, activeAlerts: 0, riskLabel: "Unknown", riskProbability: 0 },
        predictions: [], trends: [], readings: [], alerts: [], areas: [],
      });
    }

    const latest   = rows[0];
    const trendRows = [...rows].reverse();

    // ── 2. ML predictions (graceful if table missing) ──────────────────────
    let predictions: any[] = [];
    try {
      const predRes = await pool.query(
        `SELECT date, risk_code, risk_label,
                COALESCE(risk_probability,0) AS risk_probability,
                model_name
         FROM fire_risk_predictions
         WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE
         ORDER BY date ASC LIMIT 7`,
        [config.latitude, config.longitude],
      );
      predictions = predRes.rows.map((r) => ({
        date:             String(r.date).slice(0, 10),
        risk_code:        r.risk_code,
        risk_label:       r.risk_label,
        risk_probability: Number(r.risk_probability),
        model_name:       r.model_name,
      }));
    } catch { predictions = []; }

    // ── 3. IoT sensor readings (graceful if table missing) ─────────────────
    let sensorMap: Record<string, number> = {};
    try {
      const sRes = await pool.query(
        `SELECT DISTINCT ON (sensor_type) sensor_type, value
         FROM iot_sensor_readings ORDER BY sensor_type, measured_at DESC`,
      );
      for (const r of sRes.rows) sensorMap[String(r.sensor_type).toLowerCase()] = toNum(r.value);
    } catch { sensorMap = {}; }

    const temperature = sensorMap["temperature"] ?? toNum(latest.temp_mean);
    const humidity    = sensorMap["humidity"]    ?? toNum(latest.humidity_mean);
    const windSpeed   = sensorMap["wind"] ?? sensorMap["wind_speed"] ?? toNum(latest.wind_speed_max);
    const rainfall    = sensorMap["rainfall"] ?? sensorMap["precipitation"] ?? toNum(latest.precipitation_sum);

    // ── 4. Build arrays ────────────────────────────────────────────────────
    const readings = rows.map((r) => {
      const t = toNum(r.temp_mean), h = toNum(r.humidity_mean), w = toNum(r.wind_speed_max), rf = toNum(r.precipitation_sum);
      return { time: String(r.date).slice(0, 10), location: r.location_key, temperature: t, humidity: h, windSpeed: w, rainfall: rf, pressure: 0, status: condition(t, h, w, rf) };
    });

    const trends = trendRows.map((r) => ({
      time: String(r.date).slice(0, 10), temperature: toNum(r.temp_mean), humidity: toNum(r.humidity_mean), windSpeed: toNum(r.wind_speed_max),
    }));

    const cond = condition(temperature, humidity, windSpeed, rainfall);
    const areas = [{
      area: config.locationKey, avgTemperature: temperature, avgHumidity: humidity, avgWindSpeed: windSpeed,
      condition: cond, action: action(cond),
      lat: toNum(latest.latitude, config.latitude), lng: toNum(latest.longitude, config.longitude),
    }];

    const alertMsg: Record<string, string> = {
      "Critical Watch": "High temperature, low humidity, and strong wind — urgent monitoring required.",
      "Dry Conditions":  "Dry environmental conditions detected.",
      "Wind Alert":      "Strong wind conditions detected.",
    };
    const weatherAlerts = cond === "Stable" ? [] : [{
      time: String(latest.date).slice(0, 10), type: cond, location: config.locationKey, severity: severity(cond), message: alertMsg[cond] ?? "",
    }];

    // ── 5. Use today's prediction for overview risk ────────────────────────
    const todayPred      = predictions[0];
    const riskLabel      = todayPred?.risk_label      ?? "Unknown";
    const riskProbability = todayPred?.risk_probability ?? 0;

    return res.json({
      overview: {
        monitoringStatus: "Active",
        lastUpdated:      latest.updated_at ? new Date(latest.updated_at).toLocaleString() : String(latest.date).slice(0, 10),
        dataSource:       Object.keys(sensorMap).length > 0 ? "Database + IoT Sensors" : "Database",
        temperature, humidity, windSpeed, rainfall, pressure: 0,
        activeAlerts:     weatherAlerts.length,
        riskLabel,
        riskProbability,
      },
      predictions,   // full 7-day array
      trends,
      readings,
      alerts:  weatherAlerts,
      areas,
    });

  } catch (e: any) {
    console.error("dashboard/home error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});