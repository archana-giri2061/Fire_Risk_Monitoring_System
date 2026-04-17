//Import application configuration values
import { config } from "../config";
// Import necessary package
import { fetchArchiveDailyWeather } from "./archive.service";
import { fetchForecastDailyWeather } from "./forecast.service";
import { upsertArchive, replaceForecast } from "./weatherStore.service";
import { exportLiveWeatherDataset } from "./datasetExport.service";
//Import PostgreSQL connection Pool
import { pool } from "../db";
/**
 * Convert a JavaScript Date object into YYYY-MM-DD format
 * Example: 2026-04-16
 */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
/**
 * Retry helper function
 * Executes an async function and retries if it fails
 *
 * @param fn       Function to execute
 * @param label    Name shown in logs
 * @param retries  Number of retry attempts
 * @param delayMs  Delay between retries in milliseconds
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 3,
  delayMs = 3000,
): Promise<T> {
  let lastError: any;
  //Try multiple times
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();//return result if successful
    } catch (err: any) {
      lastError = err;
      //log failed attempt
      console.warn(`  ${label} failed (attempt ${attempt}/${retries}): ${err.message}`);
      //Wait before next retry
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  // Throw error after all retries fail
  throw lastError;
}

/**
 * Delete old archive weather data older than keepDays
 *
 * Keeps database clean by removing outdated historical rows
 *
 * @param keepDays Number of recent days to keep
 * @returns Number of deleted rows
 */
async function deleteOldArchiveData(keepDays: number): Promise<number> {
  const result = await pool.query(
    `DELETE FROM daily_weather
     WHERE location_key = $1
       AND data_source  = 'archive'
       AND date < CURRENT_DATE - INTERVAL '1 day' * $2`,
    [config.locationKey, keepDays],
  );
  return result.rowCount ?? 0;
}
/**
 * Main weather sync function
 *
 * Steps:
 * 1. Delete old archive data
 * 2. Fetch fresh historical weather data
 * 3. Fetch fresh forecast data
 * 4. Save data into database
 * 5. Export dataset for ML model
 */
export async function syncWeatherData() {
   // Today's date
  const end   = new Date();
  // Start date = today - archiveDays
  const start = new Date();
  start.setDate(end.getDate() - config.archiveDays);

  const startDate = toISODate(start);
  const endDate   = toISODate(end);

  console.log(`\n  Weather sync started: ${startDate} → ${endDate}`);

  // Delete old data beyond our window
  const deleted = await deleteOldArchiveData(config.archiveDays);
  if (deleted > 0) {
    console.log(`  Deleted ${deleted} old archive rows (keeping last ${config.archiveDays} days)`);
  }

  // Fetch fresh archive from Open-Meteo
  const archiveRows = await withRetry(
    () => fetchArchiveDailyWeather({
      latitude:   config.latitude,
      longitude:  config.longitude,
      start_date: startDate,
      end_date:   endDate,
    }),
    "Archive fetch",
  );

  // Fetch fresh 7-day forecast 
  const forecastRows = await withRetry(
    () => fetchForecastDailyWeather({
      latitude:  config.latitude,
      longitude: config.longitude,
      days:      config.forecastDays,
    }),
    "Forecast fetch",
  );

  // ── Step 4: Save to DB 
  const archiveResult = await upsertArchive({
    location_key: config.locationKey,
    latitude:     config.latitude,
    longitude:    config.longitude,
    rows:         archiveRows,
  });

  const forecastResult = await replaceForecast({
    latitude:  config.latitude,
    longitude: config.longitude,
    rows:      forecastRows,
  });

  // ── Step 5: Export CSV dataset for ML
  const datasetResult = await exportLiveWeatherDataset(startDate, endDate);

  console.log(` Sync complete — archive: ${archiveResult.insertedOrUpdated} rows, forecast: ${forecastResult.insertedOrUpdated} rows`);

  return {
    ok:        true,
    deleted,
    archive:   archiveResult,
    forecast:  forecastResult,
    dataset:   datasetResult,
    startDate,
    endDate,
  };
}