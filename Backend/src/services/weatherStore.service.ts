// weatherStore.service.ts
// Data access layer for persisting weather data to the database.
// Provides two functions used by WeatherSync.service.ts:
//   upsertArchive   — writes historical archive rows to daily_weather
//   replaceForecast — atomically replaces forecast rows in daily_weather_forecast

import { pool }            from "../db";
import { DailyWeatherRow } from "./archive.service";  // Shared row shape from the API fetchers


// Upserts a batch of historical archive weather rows into the daily_weather table.
// Uses ON CONFLICT DO UPDATE so re-running a sync never creates duplicate rows —
// existing rows for the same (location_key, date, data_source) are updated in place.
//
// All rows are written inside a single transaction so either the entire batch
// succeeds or the entire batch rolls back — no partial updates are left in the table.
//
// Parameters:
//   location_key : Location label used as part of the unique key, e.g. "lumbini_28.002_83.036"
//   latitude     : Decimal latitude stored alongside each row for ML query compatibility
//   longitude    : Decimal longitude stored alongside each row for ML query compatibility
//   rows         : Array of DailyWeatherRow objects from fetchArchiveDailyWeather()
//
// Returns:
//   { insertedOrUpdated: number } — count of rows processed (inserted or updated)
export async function upsertArchive(args: {
  location_key: string;
  latitude:     number;
  longitude:    number;
  rows:         DailyWeatherRow[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sql = `
      INSERT INTO daily_weather
        (location_key, latitude, longitude, date,
         temp_max, temp_min, temp_mean,
         humidity_mean, precipitation_sum, wind_speed_max,
         data_source, updated_at)
      VALUES
        ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, 'archive', NOW())
      ON CONFLICT (location_key, date, data_source)
      DO UPDATE SET
        latitude          = EXCLUDED.latitude,
        longitude         = EXCLUDED.longitude,
        temp_max          = EXCLUDED.temp_max,
        temp_min          = EXCLUDED.temp_min,
        temp_mean         = EXCLUDED.temp_mean,
        humidity_mean     = EXCLUDED.humidity_mean,
        precipitation_sum = EXCLUDED.precipitation_sum,
        wind_speed_max    = EXCLUDED.wind_speed_max,
        updated_at        = NOW()
    `;

    for (const row of args.rows) {
      await client.query(sql, [
        args.location_key,  // $1  — part of the unique conflict key
        args.latitude,      // $2  — stored per row so ML queries can filter by coords
        args.longitude,     // $3
        row.date,           // $4  — cast to DATE in SQL
        row.temp_max,       // $5
        row.temp_min,       // $6
        row.temp_mean,      // $7  — derived as (max + min) / 2 by the archive fetcher
        row.humidity_mean,  // $8  — derived by averaging 24 hourly values
        row.precipitation_sum, // $9
        row.wind_speed_max,    // $10
      ]);
    }

    await client.query("COMMIT");
    return { insertedOrUpdated: args.rows.length };

  } catch (e) {
    // Roll back the entire batch on any failure — no partial writes
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();  // Always return the connection to the pool
  }
}


// Atomically replaces all forecast rows for the given coordinates with a fresh
// set of rows from the Open-Meteo Forecast API.
//
// Uses a DELETE then INSERT approach within a single transaction rather than
// a simple upsert because forecast data shifts day-by-day — rows from a previous
// sync that no longer appear in the latest API response must be removed, not kept.
// The ON CONFLICT DO UPDATE clause handles the edge case where the DELETE and INSERT
// run concurrently in a high-concurrency environment.
//
// Parameters:
//   latitude  : Decimal latitude used to identify which rows to delete and insert
//   longitude : Decimal longitude used to identify which rows to delete and insert
//   rows      : Array of DailyWeatherRow objects from fetchForecastDailyWeather()
//
// Returns:
//   { insertedOrUpdated: number } — count of rows written
export async function replaceForecast(args: {
  latitude:  number;
  longitude: number;
  rows:      DailyWeatherRow[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete all existing forecast rows for this location before inserting the new ones.
    // This ensures stale days from a previous sync are never left in the table.
    await client.query(
      `DELETE FROM daily_weather_forecast
       WHERE latitude  = $1
         AND longitude = $2`,
      [args.latitude, args.longitude],
    );

    const sql = `
      INSERT INTO daily_weather_forecast
        (latitude, longitude, date,
         temp_max, temp_min, temp_mean,
         humidity_mean, precipitation_sum, wind_speed_max,
         updated_at)
      VALUES
        ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (latitude, longitude, date)
      DO UPDATE SET
        temp_max          = EXCLUDED.temp_max,
        temp_min          = EXCLUDED.temp_min,
        temp_mean         = EXCLUDED.temp_mean,
        humidity_mean     = EXCLUDED.humidity_mean,
        precipitation_sum = EXCLUDED.precipitation_sum,
        wind_speed_max    = EXCLUDED.wind_speed_max,
        updated_at        = NOW()
    `;

    for (const row of args.rows) {
      await client.query(sql, [
        args.latitude,      // $1  — part of the unique conflict key
        args.longitude,     // $2
        row.date,           // $3  — cast to DATE in SQL
        row.temp_max,       // $4
        row.temp_min,       // $5
        row.temp_mean,      // $6  — derived as (max + min) / 2 by the forecast fetcher
        row.humidity_mean,  // $7  — derived by averaging 24 hourly values
        row.precipitation_sum, // $8
        row.wind_speed_max,    // $9
      ]);
    }

    await client.query("COMMIT");
    return { insertedOrUpdated: args.rows.length };

  } catch (e) {
    // Roll back both the DELETE and all INSERTs on any failure
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}