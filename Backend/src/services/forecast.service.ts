// forecast.service.ts
// Fetches upcoming daily weather forecast data from the Open-Meteo Forecast API
// and returns it as normalised DailyWeatherRow objects for storage in
// the daily_weather_forecast table by WeatherSync.service.ts.
//
// Mirrors the structure of archive.service.ts but calls the forecast endpoint
// instead of the archive endpoint, and accepts a days parameter instead of a
// date range.

import { DailyWeatherRow } from "./archive.service";  // Reuses the same row shape as archive data


// Fetches the upcoming daily weather forecast from the Open-Meteo Forecast API
// for the given coordinates.
//
// Like the Archive API, the Forecast API does not provide a daily temp_mean or
// a daily humidity aggregate, so both are derived here using the same approach
// as archive.service.ts — temp_mean from (max + min) / 2, and humidity_mean
// by averaging the 24 hourly values for each day.
//
// Parameters:
//   latitude  : Decimal latitude of the monitored location
//   longitude : Decimal longitude of the monitored location
//   days      : Number of forecast days to fetch (default 7, max 16 for Open-Meteo free tier)
//
// Returns:
//   Array of DailyWeatherRow objects, one per forecast day.
//   Returns an empty array if the API response contains no daily data.
export async function fetchForecastDailyWeather(args: {
  latitude:  number;
  longitude: number;
  days?:     number;
}): Promise<DailyWeatherRow[]> {

  const days = args.days ?? 7;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",      String(args.latitude));
  url.searchParams.set("longitude",     String(args.longitude));
  url.searchParams.set("timezone",      "Asia/Kathmandu");
  url.searchParams.set("forecast_days", String(days));

  // Request the four daily fields available from the Forecast API.
  // temperature_2m_mean is intentionally excluded — it is not supported
  // and is derived from max and min instead.
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "wind_speed_10m_max",
    ].join(","),
  );

  // Request hourly humidity so it can be averaged into a daily humidity_mean.
  // The Forecast API does not provide a daily humidity aggregate field.
  url.searchParams.set("hourly", "relative_humidity_2m");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Forecast API failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const d    = data?.daily;   // Daily parallel arrays keyed by field name
  const h    = data?.hourly;  // Hourly parallel arrays keyed by field name

  // Return empty array if the response contains no daily data at all
  if (!d || !Array.isArray(d.time)) return [];

  return d.time.map((date: string, i: number) => {
    const temp_max = d.temperature_2m_max?.[i] ?? null;
    const temp_min = d.temperature_2m_min?.[i] ?? null;

    // Derive temp_mean from max and min — rounded to 1 decimal place.
    // Returns null if either value is missing so no partial average is stored.
    const temp_mean =
      temp_max !== null && temp_min !== null
        ? Math.round(((temp_max + temp_min) / 2) * 10) / 10
        : null;

    // Derive humidity_mean by averaging the 24 hourly values for this day.
    // Open-Meteo's hourly array is a flat list of all hours across all days —
    // day i occupies indices [i*24 .. i*24+23] in the array.
    // Null and NaN values are excluded so a few missing hours do not distort
    // the daily mean.
    let humidity_mean: number | null = null;
    if (h && Array.isArray(h.relative_humidity_2m)) {
      const startHour = i * 24;
      const endHour   = startHour + 24;
      const slice     = h.relative_humidity_2m.slice(startHour, endHour) as (number | null)[];
      const valid     = slice.filter((v): v is number => v !== null && !isNaN(v));

      if (valid.length > 0) {
        const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
        humidity_mean = Math.round(avg * 10) / 10;  // Round to 1 decimal place
      }
      // If no valid hourly values exist for this day, humidity_mean stays null
    }

    return {
      date,
      temp_max,
      temp_min,
      temp_mean,
      humidity_mean,
      precipitation_sum: d.precipitation_sum?.[i]  ?? null,
      wind_speed_max:    d.wind_speed_10m_max?.[i]  ?? null,  // Renamed from API field to match DB column
    };
  });
}