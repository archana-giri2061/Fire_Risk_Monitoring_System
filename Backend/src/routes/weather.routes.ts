import { Router } from "express";
import { z } from "zod";
import { fetchDailyWeather } from "../services/openMeteo.service";
import { upsertDailyRows } from "../services/weatherStore.service";
import { pool } from "../db";
import { last60DaysRange } from "../utils/date";

export const weatherRouter = Router();

/** ✅ DB Test */
weatherRouter.get("/db-test", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    res.json({
      success: true,
      message: "Database connected successfully",
      time: result.rows[0]?.current_time ?? null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** ✅ Store past 2 months (last 60 days) for Lumbini coordinate */
weatherRouter.post("/fetchhistoriclumbinidata", async (_req, res) => {
  const latitude = 28.002;
  const longitude = 83.036;
  const location_key = "lumbini_28.002_83.036";

  const { start_date, end_date } = last60DaysRange();

  const rows = await fetchDailyWeather({ latitude, longitude, start_date, end_date });
  const result = await upsertDailyRows({ location_key, latitude, longitude, rows });

  res.json({
    ok: true,
    location_key,
    start_date,
    end_date,
    fetched: rows.length,
    ...result,
  });
});

/** ✅ Check how many rows exist for that location */
weatherRouter.get("/count", async (req, res) => {
  const location_key = String(req.query.location_key ?? "");
  const q = `
    SELECT COUNT(*)::int AS total
    FROM daily_weather
    WHERE ($1 = '' OR location_key = $1)
  `;
  const { rows } = await pool.query(q, [location_key]);
  res.json({ location_key: location_key || "ALL", total: rows[0]?.total ?? 0 });
});

/** Manual fetch/store (any lat/lon) */
weatherRouter.post("/fetch-store", async (req, res) => {
  const schema = z.object({
    location_key: z.string().min(1),
    latitude: z.number(),
    longitude: z.number(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { location_key, latitude, longitude, start_date, end_date } = parsed.data;

  const rows = await fetchDailyWeather({ latitude, longitude, start_date, end_date });
  const result = await upsertDailyRows({ location_key, latitude, longitude, rows });

  res.json({ ok: true, fetched: rows.length, ...result });
});

/** ✅ Read stored data */
weatherRouter.get("/", async (req, res) => {
  const location_key = String(req.query.location_key ?? "");
  const start = String(req.query.start_date ?? "");
  const end = String(req.query.end_date ?? "");

  const q = `
    SELECT location_key, latitude, longitude, date,
           temp_max, temp_min, temp_mean,
           humidity_mean, precipitation_sum, wind_speed_max
    FROM daily_weather
    WHERE ($1 = '' OR location_key = $1)
      AND ($2 = '' OR date >= $2::date)
      AND ($3 = '' OR date <= $3::date)
    ORDER BY date ASC
    LIMIT 5000
  `;

  const { rows } = await pool.query(q, [location_key, start, end]);
  res.json({ count: rows.length, data: rows });
});