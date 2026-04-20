// WeatherSync.service.ts
// Orchestrates the full weather data synchronisation pipeline.
// Called by POST /api/weather/sync-all and by the scheduled sync job in app.ts.
//
// Pipeline steps:
//   1. Delete archive rows older than the configured retention window
//   2. Fetch fresh historical data from the Open-Meteo Archive API
//   3. Fetch fresh forecast data from the Open-Meteo Forecast API
//   4. Persist both datasets to the database
//   5. Export the updated archive to a CSV file for the ML training scripts

import { config }                  from "../config";
import { fetchArchiveDailyWeather } from "./archive.service";
import { fetchForecastDailyWeather } from "./forecast.service";
import { upsertArchive, replaceForecast } from "./weatherStore.service";
import { exportLiveWeatherDataset } from "./datasetExport.service";
import { pool }                    from "../db";


// Converts a JavaScript Date object to a YYYY-MM-DD string.
// Used to build the start_date and end_date parameters for the Open-Meteo API calls.
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


// Executes an async function and retries on failure up to the given number of attempts.
// Used to make the Open-Meteo API calls resilient to transient network errors on EC2.
// Logs a warning on each failed attempt so failures are visible in the server logs.
// Waits delayMs between attempts to avoid hammering the API on repeated failures.
// Throws the last error if all attempts are exhausted.
//
// Parameters:
//   fn      : The async function to execute and potentially retry
//   label   : Name shown in warning logs to identify which step failed
//   retries : Maximum number of attempts (default 3)
//   delayMs : Milliseconds to wait between attempts (default 3000)
async function withRetry<T>(
  fn:       () => Promise<T>,
  label:    string,
  retries  = 3,
  delayMs  = 3000,
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.warn(`${label} failed (attempt ${attempt}/${retries}): ${err.message}`);

      // Wait before the next attempt unless this was the final one
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError;
}


// Deletes archive rows from daily_weather that fall outside the retention window.
// Runs at the start of every sync to prevent unbounded table growth as days accumulate.
// Only affects rows for the configured location and data_source='archive'.
//
// Parameters:
//   keepDays: Number of most recent days to retain — rows older than this are deleted
//
// Returns:
//   Number of rows deleted (0 if nothing was outside the window)
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


// Runs the full weather sync pipeline and returns a summary of what was processed.
// Called by the POST /api/weather/sync-all route handler and by the scheduled
// sync job in app.ts every cfg.syncIntervalMinutes minutes.
//
// Returns:
//   An object with ok, deleted row count, archive result, forecast result,
//   dataset export result, and the start/end date strings used for the sync.
export async function syncWeatherData() {

  // Calculate the date range: from today minus archiveDays up to today
  const end   = new Date();
  const start = new Date();
  start.setDate(end.getDate() - config.archiveDays);

  const startDate = toISODate(start);
  const endDate   = toISODate(end);

  console.log(`Weather sync started: ${startDate} to ${endDate}`);

  // Step 1: Remove archive rows outside the retention window before fetching new data
  const deleted = await deleteOldArchiveData(config.archiveDays);
  if (deleted > 0) {
    console.log(`Deleted ${deleted} old archive rows (keeping last ${config.archiveDays} days)`);
  }

  // Step 2: Fetch historical archive data from Open-Meteo with retry on failure.
  // Returns one DailyWeatherRow per day in the startDate to endDate range.
  const archiveRows = await withRetry(
    () => fetchArchiveDailyWeather({
      latitude:   config.latitude,
      longitude:  config.longitude,
      start_date: startDate,
      end_date:   endDate,
    }),
    "Archive fetch",
  );

  // Step 3: Fetch the upcoming forecast from Open-Meteo with retry on failure.
  // Returns one DailyWeatherRow per forecast day (default 7 days ahead).
  const forecastRows = await withRetry(
    () => fetchForecastDailyWeather({
      latitude:  config.latitude,
      longitude: config.longitude,
      days:      config.forecastDays,
    }),
    "Forecast fetch",
  );

  // Step 4: Persist both datasets to the database.
  // upsertArchive uses ON CONFLICT DO UPDATE so re-running never creates duplicates.
  // replaceForecast deletes then re-inserts so stale forecast days are always removed.
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

  // Step 5: Export the updated archive data to CSV so the ML training scripts
  // can read it directly from disk without needing their own database queries.
  const datasetResult = await exportLiveWeatherDataset(startDate, endDate);

  console.log(`Sync complete — archive: ${archiveResult.insertedOrUpdated} rows, forecast: ${forecastResult.insertedOrUpdated} rows`);

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