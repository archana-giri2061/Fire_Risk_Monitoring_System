import { pool } from "../db";
import { DailyWeatherRow } from "./openMeteo.service";

export async function upsertDailyRows(args: {
  location_key: string;
  latitude: number;
  longitude: number;
  rows: DailyWeatherRow[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const r of args.rows) {
      await client.query(
        `
        INSERT INTO daily_weather
          (location_key, latitude, longitude, date,
           temp_max, temp_min, temp_mean,
           humidity_mean, precipitation_sum, wind_speed_max,
           updated_at)
        VALUES
          ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (location_key, date)
        DO UPDATE SET
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          temp_max = EXCLUDED.temp_max,
          temp_min = EXCLUDED.temp_min,
          temp_mean = EXCLUDED.temp_mean,
          humidity_mean = EXCLUDED.humidity_mean,
          precipitation_sum = EXCLUDED.precipitation_sum,
          wind_speed_max = EXCLUDED.wind_speed_max,
          updated_at = NOW()
        `,
        [
          args.location_key,
          args.latitude,
          args.longitude,
          r.date,
          r.temp_max,
          r.temp_min,
          r.temp_mean,
          r.humidity_mean,
          r.precipitation_sum,
          r.wind_speed_max,
        ]
      );
    }

    await client.query("COMMIT");
    return { insertedOrUpdated: args.rows.length };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}