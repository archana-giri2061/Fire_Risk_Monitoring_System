import { Router, Request, Response } from "express";
import { pool } from "../db";
import { config } from "../config";

export const dashboardRouter = Router();

function toNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getCondition(
  temperature: number,
  humidity: number,
  windSpeed: number,
  rainfall: number
): string {
  if (temperature >= 32 && humidity <= 40 && windSpeed >= 18) return "Critical Watch";
  if (humidity <= 45 && rainfall <= 1) return "Dry Conditions";
  if (windSpeed >= 20) return "Wind Alert";
  return "Stable";
}

function getAction(condition: string): string {
  switch (condition) {
    case "Critical Watch":
      return "Immediate monitoring required";
    case "Dry Conditions":
      return "Monitor closely";
    case "Wind Alert":
      return "Check windy zones";
    default:
      return "Routine monitoring";
  }
}

function getSeverity(condition: string): string {
  switch (condition) {
    case "Critical Watch":
      return "High";
    case "Dry Conditions":
    case "Wind Alert":
      return "Medium";
    default:
      return "Low";
  }
}

dashboardRouter.get("/home", async (_req: Request, res: Response) => {
  try {
    console.log("/api/dashboard/home route hit");

    // Fetch latest archive data
    const archiveResult = await pool.query(
      `
      SELECT
        date,
        location_key,
        latitude,
        longitude,
        temp_mean,
        humidity_mean,
        wind_speed_max,
        precipitation_sum,
        updated_at
      FROM daily_weather
      WHERE location_key = $1
        AND data_source = 'archive'
      ORDER BY date DESC
      LIMIT 12
      `,
      [config.locationKey]
    );

    const latestRows = archiveResult.rows;

    if (!latestRows.length) {
      return res.json({
        overview: {
          monitoringStatus: "No Data",
          lastUpdated: "Not available",
          dataSource: "Database",
          temperature: 0,
          humidity: 0,
          windSpeed: 0,
          rainfall: 0,
          pressure: 0,
          activeAlerts: 0,
        },
        trends: [],
        readings: [],
        alerts: [],
        areas: [],
      });
    }

    const latest = latestRows[0];
    const trendRows = [...latestRows].reverse();

    // Fetch latest sensor data
    let sensorRows: { sensor_type: string; value: number; measured_at: string }[] = [];
    try {
      const sensorResult = await pool.query(
        `
        SELECT DISTINCT ON (sensor_type)
          sensor_type,
          value,
          measured_at
        FROM iot_sensor_readings
        ORDER BY sensor_type, measured_at DESC
        `
      );
      sensorRows = sensorResult.rows;
    } catch (sensorError: any) {
      console.warn("⚠ sensor query skipped:", sensorError.message);
    }

    // Map sensor values
    const sensorMap: Record<string, number> = {};
    for (const row of sensorRows) {
      sensorMap[row.sensor_type.toLowerCase()] = toNumber(row.value);
    }

    const temperature = sensorMap["temperature"] ?? toNumber(latest.temp_mean);
    const humidity = sensorMap["humidity"] ?? toNumber(latest.humidity_mean);
    const windSpeed =
      sensorMap["wind"] ?? sensorMap["wind_speed"] ?? toNumber(latest.wind_speed_max);
    const rainfall =
      sensorMap["rainfall"] ?? sensorMap["precipitation"] ?? toNumber(latest.precipitation_sum);

    // Prepare readings
    const readings = latestRows.map((row) => {
      const t = toNumber(row.temp_mean);
      const h = toNumber(row.humidity_mean);
      const w = toNumber(row.wind_speed_max);
      const r = toNumber(row.precipitation_sum);
      return {
        time: String(row.date),
        location: row.location_key,
        temperature: t,
        humidity: h,
        windSpeed: w,
        rainfall: r,
        pressure: 0,
        status: getCondition(t, h, w, r),
      };
    });

    // Prepare trends
    const trends = trendRows.map((row) => ({
      time: String(row.date),
      temperature: toNumber(row.temp_mean),
      humidity: toNumber(row.humidity_mean),
      windSpeed: toNumber(row.wind_speed_max),
    }));

    const latestCondition = getCondition(temperature, humidity, windSpeed, rainfall);

    const areas = [
      {
        area: config.locationKey,
        avgTemperature: temperature,
        avgHumidity: humidity,
        avgWindSpeed: windSpeed,
        condition: latestCondition,
        action: getAction(latestCondition),
        lat: toNumber(latest.latitude, config.latitude),
        lng: toNumber(latest.longitude, config.longitude),
      },
    ];

    const alerts =
      latestCondition === "Stable"
        ? []
        : [
            {
              time: String(latest.date),
              type: latestCondition,
              location: config.locationKey,
              severity: getSeverity(latestCondition),
              message:
                latestCondition === "Critical Watch"
                  ? "High temperature, low humidity, and strong wind require urgent monitoring."
                  : latestCondition === "Dry Conditions"
                  ? "Dry environmental conditions detected in the monitored area."
                  : "Strong wind conditions detected in the monitored area.",
            },
          ];

    return res.json({
      overview: {
        monitoringStatus: "Active",
        lastUpdated: latest.updated_at
          ? new Date(latest.updated_at).toLocaleString()
          : String(latest.date),
        dataSource: sensorRows.length > 0 ? "Database + Sensor Readings" : "Database",
        temperature,
        humidity,
        windSpeed,
        rainfall,
        pressure: 0,
        activeAlerts: alerts.length,
      },
      trends,
      readings,
      alerts,
      areas,
    });
  } catch (e: any) {
    console.error("dashboard/home error:", e);
    return res.status(500).json({
      ok: false,
      error: e.message || "Failed to load dashboard data",
    });
  }
});