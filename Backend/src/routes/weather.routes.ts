import { Router } from "express";
import { pool } from "../db";
import { syncWeatherData } from "../services/WeatherSync.service";
import { config } from "../config";

export const weatherRouter = Router();

weatherRouter.get("/db-test", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ ok: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

weatherRouter.post("/sync-all", async (_req, res) => {
  try {
    const result = await syncWeatherData();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

weatherRouter.get("/archive", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM daily_weather
      WHERE location_key = $1
        AND data_source = 'archive'
      ORDER BY date DESC
      `,
      [config.locationKey],
    );

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

weatherRouter.get("/forecast", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM daily_weather_forecast
      WHERE latitude = $1
        AND longitude = $2
      ORDER BY date ASC
      `,
      [config.latitude, config.longitude],
    );

    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});