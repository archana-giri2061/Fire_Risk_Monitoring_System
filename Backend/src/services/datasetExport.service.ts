import fs from "fs";
import path from "path";
import { pool } from "../db";
import { config } from "../config";

export async function exportLiveWeatherDataset(startDate: string, endDate: string) {
  const { rows } = await pool.query(
    `
    SELECT
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
    ORDER BY date ASC
    `,
    [config.locationKey, startDate, endDate]
  );

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

  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.date?.toISOString?.().slice(0, 10) ?? r.date,
        r.temp_max ?? "",
        r.temp_min ?? "",
        r.temp_mean ?? "",
        r.humidity_mean ?? "",
        r.precipitation_sum ?? "",
        r.wind_speed_max ?? "",
        r.data_source ?? "",
      ].join(","),
    ),
  ];

  const outPath = path.resolve(process.cwd(), config.datasetExportPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");

  return {
    ok: true,
    path: outPath,
    rows: rows.length,
  };
}