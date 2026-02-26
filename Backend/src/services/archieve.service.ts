import { DailyWeatherRow } from "./weatherStore.service";

export async function fetchArchiveDailyWeather(args: {
  latitude: number;
  longitude: number;
  start_date: string;
  end_date: string;
}): Promise<DailyWeatherRow[]> {

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");

  url.searchParams.set("latitude", String(args.latitude));
  url.searchParams.set("longitude", String(args.longitude));
  url.searchParams.set("start_date", args.start_date);
  url.searchParams.set("end_date", args.end_date);
  url.searchParams.set("timezone", "Asia/Kathmandu");

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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Archive API failed: ${res.status} ${res.statusText} ${text}`);
  }

  const data = await res.json();
  const d = data?.daily;

  if (!d || !Array.isArray(d.time)) return [];

  return d.time.map((date: string, i: number) => ({
    date,
    temp_max: d.temperature_2m_max?.[i] ?? null,
    temp_min: d.temperature_2m_min?.[i] ?? null,
    temp_mean: d.temperature_2m_mean?.[i] ?? null,
    humidity_mean: d.relative_humidity_2m_mean?.[i] ?? null,
    precipitation_sum: d.precipitation_sum?.[i] ?? null,
    wind_speed_max: d.wind_speed_10m_max?.[i] ?? null
  }));
}