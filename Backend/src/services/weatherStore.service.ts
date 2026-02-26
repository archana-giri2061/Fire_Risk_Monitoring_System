import { pool } from "../db";

export type DailyWeatherRow = {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_mean: number | null;
  humidity_mean: number | null;
  precipitation_sum: number | null;
  wind_speed_max: number | null;
};

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
        (location_key, latitude, longitude, date,
         temp_max, temp_min, temp_mean,
         humidity_mean, precipitation_sum, wind_speed_max,
         data_source)
      VALUES
        ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,'archive')
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

    for (const r of args.rows) {
      await client.query(sql, [
        args.location_key,   // $1
        args.latitude,       // $2
        args.longitude,      // $3
        r.date,              // $4
        r.temp_max,          // $5
        r.temp_min,          // $6
        r.temp_mean,         // $7
        r.humidity_mean,     // $8
        r.precipitation_sum, // $9
        r.wind_speed_max     // $10
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
/* ---------------- FORECAST STORE ---------------- */

export async function upsertForecastWeather(args:{
    latitude: number,
  longitude: number,
  rows: DailyWeatherRow[]
}) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

  // Delete old future forecast before inserting new
        await pool.query(`
            DELETE FROM daily_weather_forecast
            WHERE latitude = $1 AND longitude=$2 AND date >= CURRENT_DATE
      `,
      [args.latitude, args.longitude]
    );

 const sql = `
      INSERT INTO daily_weather_forecast (
       latitude, longitude, date,
        temp_max, temp_min, temp_mean,
        humidity_mean, precipitation_sum, wind_speed_max,
        updated_at
      )
      VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (latitude, longitude, date)
      DO UPDATE SET
        temp_max = EXCLUDED.temp_max,
        temp_min = EXCLUDED.temp_min,
        temp_mean = EXCLUDED.temp_mean,
        humidity_mean = EXCLUDED.humidity_mean,
        precipitation_sum = EXCLUDED.precipitation_sum,
        wind_speed_max = EXCLUDED.wind_speed_max,
        updated_at = NOW();
    `;

    for (const row of args.rows) {
      await client.query(sql, [
        args.latitude,           // $2
        args.longitude,          // $3
        row.date,                // $4
        row.temp_max,            // $5
        row.temp_min,            // $6
        row.temp_mean,           // $7
        row.humidity_mean,       // $8
        row.precipitation_sum,   // $9
        row.wind_speed_max       // $10
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