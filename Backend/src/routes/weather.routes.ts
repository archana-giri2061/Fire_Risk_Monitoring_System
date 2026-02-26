import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { fetchArchiveDailyWeather } from "../services/archieve.service";
import { fetchForecastDailyWeather } from "../services/forecast.service";
import { upsertArchive, upsertForecastWeather } from "../services/weatherStore.service";

export const weatherRouter = Router();

// ✅ DB test
weatherRouter.get("/db-test", async (_req, res) => {
  try {
    const r = await pool.query("SELECT NOW() AS current_time");
    res.json({ success: true, time: r.rows[0]?.current_time ?? null });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * ✅ ARCHIVE: store past 2 months (last 60 days) in daily_weather
 * POST /api/weather/archivehistoricdata
 */
weatherRouter.post("/archivehistoricdata", async (_req, res) => {
  try {
    const latitude = 28.002;
    const longitude = 83.036;
    const location_key = "lumbini_28.002_83.036";

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 60);

    const toISO = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const start_date = toISO(start);
    const end_date = toISO(end);

    // ✅ correct call (only these params)
    const rows = await fetchArchiveDailyWeather({
      latitude,
      longitude,
      start_date,
      end_date,
    });

    // ✅ correct upsert call (object + data_source required)
    const result = await upsertArchive({
      location_key,
      latitude,
      longitude,
      rows,
    });

    res.json({
      ok: true,
      table: "daily_weather",
      start_date,
      end_date,
      fetched: rows.length,
      ...result,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * ✅ FORECAST: store upcoming next N days in daily_weather_forecast
 * POST /api/weather/forecastupcomingdata
 * body: { "days": 7 }
 */
weatherRouter.post("/forecastupcomingdata", async (req, res) => {
  try {
    const schema = z.object({
      days: z.number().int().min(1).max(16).optional(),
    });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    }

    const latitude = 28.002;
    const longitude = 83.036;
    const location_key = "lumbini_28.002_83.036";
    const days = parsed.data.days ?? 7;

    const rows = await fetchForecastDailyWeather({ latitude, longitude, days });

    // ✅ forecast goes to separate table
    const result = await upsertForecastWeather({
        latitude,
      longitude,
      rows,
    });

    res.json({
      ok: true,
      table: "daily_weather_forecast",
      days,
      fetched: rows.length,
      ...result,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * ✅ GET ARCHIVE data from daily_weather
 * GET /api/weather/archive?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 */
weatherRouter.get("/archive", async (req, res) => {
  try {
    const location_key = String(req.query.location_key ?? "lumbini_28.002_83.036");
    const start = String(req.query.start_date ?? "");
    const end = String(req.query.end_date ?? "");

    const q = `
      SELECT location_key, latitude, longitude, date,
             temp_max, temp_min, temp_mean, humidity_mean,
             precipitation_sum, wind_speed_max, data_source
      FROM daily_weather
      WHERE location_key = $1
        AND ($2 = '' OR date >= $2::date)
        AND ($3 = '' OR date <= $3::date)
        AND data_source = 'archive'
      ORDER BY date ASC
      LIMIT 5000
    `;

    const { rows } = await pool.query(q, [location_key, start, end]);
    res.json({ ok: true, table: "daily_weather", count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * ✅ GET FORECAST upcoming data from daily_weather_forecast
 * GET /api/weather/forecast
 */
weatherRouter.get("/forecast", async (_req, res) => {
  try {
    const latitude = 28.002;
    const longitude = 83.036;

    const q = `
      SELECT latitude, longitude, date,
             temp_max, temp_min, temp_mean, humidity_mean,
             precipitation_sum, wind_speed_max
      FROM daily_weather_forecast
      WHERE latitude = $1 AND longitude = $2
        AND date >= CURRENT_DATE
      ORDER BY date ASC
      LIMIT 100
    `;

    const { rows } = await pool.query(q, [latitude, longitude]);
    res.json({ ok: true, table: "daily_weather_forecast", count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});