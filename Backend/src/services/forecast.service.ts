export type DailyWeatherRow = {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_mean: number | null;
  humidity_mean: number | null;
  precipitation_sum: number | null;
  wind_speed_max: number | null;
};

export async function fetchForecastDailyWeather(args: {
  latitude: number;
  longitude: number;
  days?: number;
}): Promise<DailyWeatherRow[]> {
  const days = args.days ?? 7;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(args.latitude));
  url.searchParams.set("longitude", String(args.longitude));
  url.searchParams.set("timezone", "Asia/Kathmandu");
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "temperature_2m_mean",
      "relative_humidity_2m_mean",
      "precipitation_sum",
      "wind_speed_10m_max"
    ].join(",")
  );

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Forecast API failed: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const d = data?.daily;
  if (!d?.time || !Array.isArray(d.time)) return [];

  return d.time.map((date: string, i: number) => ({
    date,
    temp_max: d.temperature_2m_max?.[i] ?? null,
    temp_min: d.temperature_2m_min?.[i] ?? null,
    temp_mean: d.temperature_2m_mean?.[i] ?? null,
    humidity_mean: d.relative_humidity_2m_mean?.[i] ?? null,
    precipitation_sum: d.precipitation_sum?.[i] ?? null,
    wind_speed_max: d.wind_speed_10m_max?.[i] ?? null,
  }));
}