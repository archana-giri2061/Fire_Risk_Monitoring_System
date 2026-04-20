// weather.routes.ts
// Express router for weather data synchronisation and retrieval.
// Handles fetching data from the Open-Meteo API and storing it in the database,
// as well as exposing archive, forecast, and summary data to the frontend.
// All routes are prefixed with /api/weather via app.ts.

import { requireAdmin }    from "../middleware/auth.middleware";
import { Router }          from "express";
import { pool }            from "../db";
import { syncWeatherData } from "../services/WeatherSync.service";
import { config }          from "../config";

export const weatherRouter = Router();


weatherRouter.get("/db-test", async (_req, res) => {
  /**
   * Simple liveness check that verifies the database connection is working.
   * Runs a minimal query (SELECT NOW()) and returns the server timestamp.
   * Useful for diagnosing connectivity issues on the EC2 instance without
   * needing to check a table that may not exist yet.
   */
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ ok: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


weatherRouter.post("/sync-all", requireAdmin, async (_req, res) => {
  /**
   * Fetches weather data from the Open-Meteo API and upserts it into the database.
   * Protected by requireAdmin — requires x-admin-key header.
   * Delegates all sync logic to syncWeatherData() in WeatherSync.service.ts which
   * handles both the archive (historical) and forecast (upcoming) API calls.
   */
  try {
    const result = await syncWeatherData();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


weatherRouter.get("/archive", async (req, res) => {
  /**
   * Returns stored historical weather records for the configured location,
   * ordered newest first. Used by the frontend weather charts and the ML
   * training pipeline to access recent climate data.
   *
   * Query params:
   *   limit: Number of days to return (default 60, max 365)
   */
  try {
    const limit = Math.min(Number(req.query.limit ?? 60), 365);
    const { rows } = await pool.query(
      `SELECT date, location_key, latitude, longitude,
              temp_max, temp_min, temp_mean,
              humidity_mean, precipitation_sum, wind_speed_max,
              data_source, updated_at
       FROM daily_weather
       WHERE location_key = $1
         AND data_source  = 'archive'
       ORDER BY date DESC
       LIMIT $2`,
      [config.locationKey, limit],
    );
    res.json({
      ok:       true,
      count:    rows.length,
      location: config.locationKey,
      data:     rows.map((r) => ({
        ...r,
        date: String(r.date).slice(0, 10),  // Normalise to YYYY-MM-DD string
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


weatherRouter.get("/forecast", async (_req, res) => {
  /**
   * Returns all stored forecast rows for the configured coordinates,
   * ordered by date ascending so the frontend can render a day-by-day
   * forward view. Populated by POST /api/weather/sync-all.
   * Returns all available forecast days without a limit since the
   * Open-Meteo forecast API returns at most cfg.forecast_days rows (default 7).
   */
  try {
    const { rows } = await pool.query(
      `SELECT date, latitude, longitude,
              temp_max, temp_min, temp_mean,
              humidity_mean, precipitation_sum, wind_speed_max,
              updated_at
       FROM daily_weather_forecast
       WHERE latitude  = $1
         AND longitude = $2
       ORDER BY date ASC`,
      [config.latitude, config.longitude],
    );
    res.json({
      ok:       true,
      count:    rows.length,
      location: config.locationKey,
      data:     rows.map((r) => ({
        ...r,
        date: String(r.date).slice(0, 10),  // Normalise to YYYY-MM-DD string
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


weatherRouter.get("/summary", async (_req, res) => {
  /**
   * Returns aggregated statistics across all stored archive records for
   * the configured location. Used by the frontend dashboard summary cards.
   *
   * Computed fields:
   *   total_days       — number of days with archive data
   *   avg_temp         — mean of daily mean temperatures
   *   max_temp         — highest daily maximum recorded
   *   min_temp         — lowest daily minimum recorded
   *   avg_humidity     — mean of daily humidity percentages
   *   total_rainfall   — sum of all daily precipitation in mm
   *   from_date        — earliest date in the archive
   *   to_date          — most recent date in the archive
   */
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                                   AS total_days,
         ROUND(AVG(temp_mean)::numeric,         2)  AS avg_temp,
         ROUND(MAX(temp_max)::numeric,          2)  AS max_temp,
         ROUND(MIN(temp_min)::numeric,          2)  AS min_temp,
         ROUND(AVG(humidity_mean)::numeric,     2)  AS avg_humidity,
         ROUND(SUM(precipitation_sum)::numeric, 2)  AS total_rainfall_mm,
         MIN(date) AS from_date,
         MAX(date) AS to_date
       FROM daily_weather
       WHERE location_key = $1
         AND data_source  = 'archive'`,
      [config.locationKey],
    );
    res.json({ ok: true, location: config.locationKey, summary: rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});