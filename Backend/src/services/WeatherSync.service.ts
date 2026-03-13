import { config } from "../config";
import { fetchArchiveDailyWeather } from "./archive.service";
import { fetchForecastDailyWeather } from "./forecast.service";
import { upsertArchive, replaceForecast } from "./weatherStore.service";
import { exportLiveWeatherDataset } from "./datasetExport.service";

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function syncWeatherData() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - config.archiveDays);

  const startDate = toISODate(start);
  const endDate = toISODate(end);

  const archiveRows = await fetchArchiveDailyWeather({
    latitude: config.latitude,
    longitude: config.longitude,
    start_date: startDate,
    end_date: endDate,
  });

  const forecastRows = await fetchForecastDailyWeather({
    latitude: config.latitude,
    longitude: config.longitude,
    days: config.forecastDays,
  });

  const archiveResult = await upsertArchive({
    location_key: config.locationKey,
    latitude: config.latitude,
    longitude: config.longitude,
    rows: archiveRows,
  });

  const forecastResult = await replaceForecast({
    latitude: config.latitude,
    longitude: config.longitude,
    rows: forecastRows,
  });

const datasetResult = await exportLiveWeatherDataset(startDate, endDate);

  return {
    ok: true,
    archive: archiveResult,
    forecast: forecastResult,
    dataset: datasetResult,
    startDate,
    endDate,
  };
}