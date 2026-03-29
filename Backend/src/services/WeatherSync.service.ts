import { config } from "../config";
import { fetchArchiveDailyWeather } from "./archive.service";
import { fetchForecastDailyWeather } from "./forecast.service";
import { upsertArchive, replaceForecast } from "./weatherStore.service";
import { exportLiveWeatherDataset } from "./datasetExport.service";
import { pool } from "../db";

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 3,
  delayMs = 3000,
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.warn(`  ${label} failed (attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Delete archive rows older than keepDays from the database.
 * This keeps the DB clean — only recent data is stored.
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

export async function syncWeatherData() {
  const end   = new Date();
  const start = new Date();
  start.setDate(end.getDate() - config.archiveDays);

  const startDate = toISODate(start);
  const endDate   = toISODate(end);

  console.log(`\n  Weather sync started: ${startDate} → ${endDate}`);

  // ── Step 1: Delete old data beyond our window ──────────────────────────
  const deleted = await deleteOldArchiveData(config.archiveDays);
  if (deleted > 0) {
    console.log(`  Deleted ${deleted} old archive rows (keeping last ${config.archiveDays} days)`);
  }

  // ── Step 2: Fetch fresh archive from Open-Meteo ────────────────────────
  const archiveRows = await withRetry(
    () => fetchArchiveDailyWeather({
      latitude:   config.latitude,
      longitude:  config.longitude,
      start_date: startDate,
      end_date:   endDate,
    }),
    "Archive fetch",
  );

  // ── Step 3: Fetch fresh 7-day forecast ────────────────────────────────
  const forecastRows = await withRetry(
    () => fetchForecastDailyWeather({
      latitude:  config.latitude,
      longitude: config.longitude,
      days:      config.forecastDays,
    }),
    "Forecast fetch",
  );

  // ── Step 4: Save to DB ─────────────────────────────────────────────────
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

  // ── Step 5: Export CSV dataset for ML ─────────────────────────────────
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