import { pool } from "../db";
import { DailyWeatherRow } from "./archive.service";

export async function upsertArchive(args: {
  location_key: string;
  latitude: number;
  longitude: number;
  rows: DailyWeatherRow[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sql = `
      INSERT INTO daily_weather
      (
        location_key, latitude, longitude, date,
        temp_max, temp_min, temp_mean,
        humidity_mean, precipitation_sum, wind_speed_max,
        data_source, updated_at
      )
      VALUES
      ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,'archive',NOW())
      ON CONFLICT (location_key, date, data_source)
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
    `;

    for (const row of args.rows) {
      await client.query(sql, [
        args.location_key,
        args.latitude,
        args.longitude,
        row.date,
        row.temp_max,
        row.temp_min,
        row.temp_mean,
        row.humidity_mean,
        row.precipitation_sum,
        row.wind_speed_max,
      ]);
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

export async function replaceForecast(args: {
  latitude: number;
  longitude: number;
  rows: DailyWeatherRow[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      DELETE FROM daily_weather_forecast
      WHERE latitude = $1
        AND longitude = $2
      `,
      [args.latitude, args.longitude],
    );

    const sql = `
      INSERT INTO daily_weather_forecast
      (
        latitude, longitude, date,
        temp_max, temp_min, temp_mean,
        humidity_mean, precipitation_sum, wind_speed_max,
        updated_at
      )
      VALUES
      ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (latitude, longitude, date)
      DO UPDATE SET
        temp_max = EXCLUDED.temp_max,
        temp_min = EXCLUDED.temp_min,
        temp_mean = EXCLUDED.temp_mean,
        humidity_mean = EXCLUDED.humidity_mean,
        precipitation_sum = EXCLUDED.precipitation_sum,
        wind_speed_max = EXCLUDED.wind_speed_max,
        updated_at = NOW()
    `;

    for (const row of args.rows) {
      await client.query(sql, [
        args.latitude,
        args.longitude,
        row.date,
        row.temp_max,
        row.temp_min,
        row.temp_mean,
        row.humidity_mean,
        row.precipitation_sum,
        row.wind_speed_max,
      ]);
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