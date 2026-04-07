import { requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import { pool } from "../db";
import { syncWeatherData } from "../services/WeatherSync.service";
import { config } from "../config";

export const weatherRouter = Router();

/** GET /api/weather/db-test */
weatherRouter.get("/db-test", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ ok: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/weather/sync-all */
weatherRouter.post("/sync-all", requireAdmin, async (_req, res) => {
  try {
    const result = await syncWeatherData();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/weather/archive?limit=60 */
weatherRouter.get("/archive", async (req, res) => {
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
      data:     rows.map((r) => ({ ...r, date: String(r.date).slice(0, 10) })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/weather/forecast */
weatherRouter.get("/forecast", async (_req, res) => {
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
      data:     rows.map((r) => ({ ...r, date: String(r.date).slice(0, 10) })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** GET /api/weather/summary */
weatherRouter.get("/summary", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                              AS total_days,
         ROUND(AVG(temp_mean)::numeric, 2)     AS avg_temp,
         ROUND(MAX(temp_max)::numeric, 2)      AS max_temp,
         ROUND(MIN(temp_min)::numeric, 2)      AS min_temp,
         ROUND(AVG(humidity_mean)::numeric, 2) AS avg_humidity,
         ROUND(SUM(precipitation_sum)::numeric, 2) AS total_rainfall_mm,
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