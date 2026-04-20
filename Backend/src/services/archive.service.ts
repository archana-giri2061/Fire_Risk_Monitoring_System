// archive.service.ts
// Fetches historical daily weather data from the Open-Meteo Archive API
// and returns it as normalised DailyWeatherRow objects for storage in
// the daily_weather table by WeatherSync.service.ts.

// Shape of one day's weather data as returned by fetchArchiveDailyWeather().
// Matches the column names in the daily_weather table.
// All numeric fields are nullable because the Archive API occasionally omits
// values for days where station data was unavailable.
export type DailyWeatherRow = {
  date:              string;        // YYYY-MM-DD
  temp_max:          number | null; // Daily maximum temperature in Celsius
  temp_min:          number | null; // Daily minimum temperature in Celsius
  temp_mean:         number | null; // Derived as (temp_max + temp_min) / 2
  humidity_mean:     number | null; // Mean of 24 hourly relative humidity values
  precipitation_sum: number | null; // Total daily precipitation in mm
  wind_speed_max:    number | null; // Daily maximum wind speed in km/h
};


// Fetches historical daily weather data from the Open-Meteo Archive API
// for the given coordinates and date range.
//
// The Archive API does not provide a daily temp_mean field, so it is derived
// here as (temp_max + temp_min) / 2. Humidity is also not available as a
// daily aggregate, so 24 hourly values are fetched and averaged per day.
//
// Parameters:
//   latitude   : Decimal latitude of the monitored location
//   longitude  : Decimal longitude of the monitored location
//   start_date : ISO date string for the first day to fetch, e.g. "2026-02-19"
//   end_date   : ISO date string for the last day to fetch, e.g. "2026-04-20"
//
// Returns:
//   Array of DailyWeatherRow objects, one per day in the requested range.
//   Returns an empty array if the API response contains no daily data.
export async function fetchArchiveDailyWeather(args: {
  latitude:   number;
  longitude:  number;
  start_date: string;
  end_date:   string;
}): Promise<DailyWeatherRow[]> {

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");

  url.searchParams.set("latitude",   String(args.latitude));
  url.searchParams.set("longitude",  String(args.longitude));
  url.searchParams.set("start_date", args.start_date);
  url.searchParams.set("end_date",   args.end_date);
  url.searchParams.set("timezone",   "Asia/Kathmandu");

  // Request the four daily fields available from the Archive API.
  // temperature_2m_mean is intentionally excluded — it is not supported by
  // the Archive API and is derived from max and min instead.
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
  // The Archive API does not provide a daily humidity aggregate field.
  url.searchParams.set("hourly", "relative_humidity_2m");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Archive API failed: ${res.status} ${res.statusText}`);
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
    // Null and NaN values within the slice are excluded from the average so
    // a few missing hours do not distort the daily mean.
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