// datasetExport.service.ts
// Exports stored weather data from the daily_weather table to a CSV file
// so the ML training scripts can read it directly from disk.
// The output path is configured via DATASET_EXPORT_PATH in .env
// (default: ml/data/live_weather_dataset.csv).

import fs   from "fs";
import path from "path";
import { pool }   from "../db";
import { config } from "../config";


// Queries the daily_weather table for the given date range and writes the
// results to a CSV file at the configured export path.
//
// Parameters:
//   startDate : ISO date string for the first day to include, e.g. "2026-02-19"
//   endDate   : ISO date string for the last day to include, e.g. "2026-04-20"
//
// Returns:
//   An object containing ok, the absolute output file path, and the row count.
export async function exportLiveWeatherDataset(startDate: string, endDate: string) {
  const { rows } = await pool.query(
    `SELECT
       date,
       temp_max,
       temp_min,
       temp_mean,
       humidity_mean,
       precipitation_sum,
       wind_speed_max,
       data_source
     FROM daily_weather
     WHERE location_key = $1
       AND date BETWEEN $2 AND $3
     ORDER BY date ASC`,
    [config.locationKey, startDate, endDate],
  );

  // Column names for the CSV header row — must match the SELECT field order above
  const header = [
    "date",
    "temp_max",
    "temp_min",
    "temp_mean",
    "humidity_mean",
    "precipitation_sum",
    "wind_speed_max",
    "data_source",
  ];

  // Build the CSV lines array — first element is the header, remainder are data rows.
  // date is a PostgreSQL date type so toISOString() is used when available to get
  // a plain YYYY-MM-DD string; the fallback covers cases where it is already a string.
  // Null values are written as empty strings so the CSV parser sees an empty field
  // rather than the literal string "null".
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.date?.toISOString?.().slice(0, 10) ?? r.date,
        r.temp_max          ?? "",
        r.temp_min          ?? "",
        r.temp_mean         ?? "",
        r.humidity_mean     ?? "",
        r.precipitation_sum ?? "",
        r.wind_speed_max    ?? "",
        r.data_source       ?? "",
      ].join(","),
    ),
  ];

  // Resolve the output path relative to Backend/ (the process working directory)
  // and create any missing parent directories before writing
  const outPath = path.resolve(process.cwd(), config.datasetExportPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");

  return {
    ok:   true,
    path: outPath,    // Absolute path so the caller can log or return it in the API response
    rows: rows.length,
  };
}