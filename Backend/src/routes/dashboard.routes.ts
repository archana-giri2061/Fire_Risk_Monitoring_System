// dashboard.routes.ts
// Express router for the main dashboard data endpoint.
// Aggregates weather archive, ML predictions, and IoT sensor readings
// into a single response consumed by the frontend Home page.
// All routes are prefixed with /api/dashboard via app.ts.

import { Router } from "express";
import { pool }   from "../db";
import { config } from "../config";

export const dashboardRouter = Router();


// Safely converts any value to a finite number, returning a fallback if conversion fails.
// Used throughout to prevent NaN from propagating into the API response when
// database columns contain null or non-numeric values.
function toNum(v: any, fb = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

// Derives a human-readable weather condition label from the current weather values.
// Rules are checked in priority order — Critical Watch requires all three thresholds
// to be met simultaneously, so it is checked first.
function condition(t: number, h: number, w: number, r: number): string {
  if (t >= 32 && h <= 40 && w >= 18) return "Critical Watch";  // High temp + low humidity + strong wind
  if (h <= 45 && r <= 1)             return "Dry Conditions";   // Low humidity and near-zero rainfall
  if (w >= 20)                       return "Wind Alert";        // Strong wind regardless of temperature
  return "Stable";
}

// Returns the recommended action text for a given condition label.
// Displayed in the monitoring areas card on the frontend dashboard.
function action(c: string): string {
  return ({
    "Critical Watch": "Immediate monitoring required",
    "Dry Conditions": "Monitor closely",
    "Wind Alert":     "Check windy zones",
  } as any)[c] ?? "Routine monitoring";
}

// Returns the severity level string for a given condition label.
// Used to colour-code alert rows in the frontend alerts table.
function severity(c: string): string {
  return ({
    "Critical Watch": "High",
    "Dry Conditions": "Medium",
    "Wind Alert":     "Medium",
  } as any)[c] ?? "Low";
}


dashboardRouter.get("/home", async (_req, res) => {
  /**
   * Returns all data needed to render the frontend Home dashboard in a single request.
   * Combines four data sources:
   *   1. daily_weather archive — last 12 days for trend charts and current conditions
   *   2. fire_risk_predictions — next 7 days for the forecast table and overview risk card
   *   3. iot_sensor_readings   — latest reading per sensor type for the IoT status card
   *   4. Derived condition/alert logic — computed from the weather values above
   *
   * Both predictions and IoT readings are fetched with try/catch so the dashboard
   * still loads if those tables do not exist yet or have no data.
   *
   * Returns a minimal placeholder response if no archive weather data exists,
   * prompting the user to run a weather sync first.
   */
  try {

    // Fetch the most recent 12 days of archive weather for the configured location.
    // 12 rows gives enough history for the trend chart without over-fetching.
    const archiveRes = await pool.query(
      `SELECT date, location_key, latitude, longitude,
              temp_mean, humidity_mean, wind_speed_max, precipitation_sum, updated_at
       FROM daily_weather
       WHERE location_key=$1 AND data_source='archive'
       ORDER BY date DESC LIMIT 12`,
      [config.locationKey],
    );
    const rows = archiveRes.rows;

    // Return a safe empty-state response if no archive data exists yet.
    // The frontend uses these values to show a "Run Sync Now" prompt.
    if (!rows.length) {
      return res.json({
        overview: {
          monitoringStatus: "No Data",
          lastUpdated:      "Not available",
          dataSource:       "Run Sync Now",
          temperature: 0, humidity: 0, windSpeed: 0, rainfall: 0, pressure: 0,
          activeAlerts: 0, riskLabel: "Unknown", riskProbability: 0,
        },
        predictions: [], trends: [], readings: [], alerts: [], areas: [],
      });
    }

    const latest    = rows[0];                  // Most recent day — used for the overview cards
    const trendRows = [...rows].reverse();      // Oldest-first order for the trend chart x-axis


    // Fetch the next 7 days of fire risk predictions for the forecast table.
    // Wrapped in try/catch so a missing fire_risk_predictions table returns an
    // empty array rather than a 500 error.
    let predictions: any[] = [];
    try {
      const predRes = await pool.query(
        `SELECT date, risk_code, risk_label,
                COALESCE(risk_probability, 0) AS risk_probability,
                model_name
         FROM fire_risk_predictions
         WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE
         ORDER BY date ASC LIMIT 7`,
        [config.latitude, config.longitude],
      );
      predictions = predRes.rows.map((r) => ({
        date:             String(r.date).slice(0, 10),          // Normalise to YYYY-MM-DD string
        risk_code:        r.risk_code,
        risk_label:       r.risk_label,
        risk_probability: Number(r.risk_probability),
        model_name:       r.model_name,
      }));
    } catch { predictions = []; }


    // Fetch the latest reading per sensor type from the IoT device table.
    // DISTINCT ON (sensor_type) with ORDER BY measured_at DESC gives one row
    // per sensor type, always the most recent value.
    // Wrapped in try/catch so a missing iot_sensor_readings table returns an
    // empty map rather than a 500 error.
    let sensorMap: Record<string, number> = {};
    try {
      const sRes = await pool.query(
        `SELECT DISTINCT ON (sensor_type) sensor_type, value
         FROM iot_sensor_readings ORDER BY sensor_type, measured_at DESC`,
      );
      for (const r of sRes.rows) {
        sensorMap[String(r.sensor_type).toLowerCase()] = toNum(r.value);
      }
    } catch { sensorMap = {}; }


    // Use the most recent archive row for the overview card values.
    // IoT sensor values are available in sensorMap but weather archive is used
    // as the primary source to keep all cards consistent with the trend table.
    const temperature = toNum(latest.temp_mean);
    const humidity    = toNum(latest.humidity_mean);
    const windSpeed   = toNum(latest.wind_speed_max);
    const rainfall    = toNum(latest.precipitation_sum);


    // Build the readings array — one entry per archive row for the readings table.
    // Each row also gets a derived condition label for the status column.
    const readings = rows.map((r) => {
      const t  = toNum(r.temp_mean);
      const h  = toNum(r.humidity_mean);
      const w  = toNum(r.wind_speed_max);
      const rf = toNum(r.precipitation_sum);
      return {
        time:        String(r.date).slice(0, 10),
        location:    r.location_key,
        temperature: t,
        humidity:    h,
        windSpeed:   w,
        rainfall:    rf,
        pressure:    0,           // Not collected by the current sensor set — placeholder
        status:      condition(t, h, w, rf),
      };
    });

    // Build the trends array in chronological order for the chart x-axis.
    // Only includes the fields needed by the trend chart component.
    const trends = trendRows.map((r) => ({
      time:        String(r.date).slice(0, 10),
      temperature: toNum(r.temp_mean),
      humidity:    toNum(r.humidity_mean),
      windSpeed:   toNum(r.wind_speed_max),
    }));

    // Build the areas array — one entry per monitored location.
    // Currently always a single entry for the configured location.
    const cond  = condition(temperature, humidity, windSpeed, rainfall);
    const areas = [{
      area:           config.locationKey,
      avgTemperature: temperature,
      avgHumidity:    humidity,
      avgWindSpeed:   windSpeed,
      condition:      cond,
      action:         action(cond),
      lat:            toNum(latest.latitude,  config.latitude),   // Fall back to config if DB value is null
      lng:            toNum(latest.longitude, config.longitude),
    }];

    // Build the weather alerts array from the derived condition.
    // No alert entry is added when conditions are stable to avoid cluttering the alerts table.
    const alertMsg: Record<string, string> = {
      "Critical Watch": "High temperature, low humidity, and strong wind — urgent monitoring required.",
      "Dry Conditions": "Dry environmental conditions detected.",
      "Wind Alert":     "Strong wind conditions detected.",
    };
    const weatherAlerts = cond === "Stable" ? [] : [{
      time:     String(latest.date).slice(0, 10),
      type:     cond,
      location: config.locationKey,
      severity: severity(cond),
      message:  alertMsg[cond] ?? "",
    }];

    // Use the first prediction row (today) for the overview risk card.
    // Falls back to "Unknown" and 0 probability if no predictions exist yet.
    const todayPred       = predictions[0];
    const riskLabel       = todayPred?.risk_label       ?? "Unknown";
    const riskProbability = todayPred?.risk_probability ?? 0;

    return res.json({
      overview: {
        monitoringStatus: "Active",
        lastUpdated:      latest.updated_at
          ? new Date(latest.updated_at).toLocaleString()
          : String(latest.date).slice(0, 10),
        dataSource:   Object.keys(sensorMap).length > 0 ? "Database + IoT Sensors" : "Database",
        temperature, humidity, windSpeed, rainfall,
        pressure:     0,  // Not collected — placeholder to keep the response shape consistent
        activeAlerts: weatherAlerts.length,
        riskLabel,
        riskProbability,
      },
      predictions,  // Full 7-day forecast array for the predictions table
      trends,       // Chronological weather history for the trend chart
      readings,     // Per-day readings with derived status for the readings table
      alerts:       weatherAlerts,
      areas,        // Monitored location summary for the map/areas card
    });

  } catch (e: any) {
    console.error("dashboard/home error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});