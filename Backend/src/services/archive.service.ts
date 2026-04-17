export type DailyWeatherRow = {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_mean: number | null;
  humidity_mean: number | null;
  precipitation_sum: number | null;
  wind_speed_max: number | null;
};

export async function fetchArchiveDailyWeather(args: {
  latitude: number;
  longitude: number;
  start_date: string;
  end_date: string;
}): Promise<DailyWeatherRow[]> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");

  url.searchParams.set("latitude",   String(args.latitude));
  url.searchParams.set("longitude",  String(args.longitude));
  url.searchParams.set("start_date", args.start_date);
  url.searchParams.set("end_date",   args.end_date);
  url.searchParams.set("timezone",   "Asia/Kathmandu");

  // ── Daily fields (temp_max and temp_min only — mean is not supported) ──
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "wind_speed_10m_max",
    ].join(","),
  );

  // ── Hourly humidity — needed to calculate daily humidity_mean ──────────
  url.searchParams.set("hourly", "relative_humidity_2m");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `Archive API failed: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  const d = data?.daily;
  const h = data?.hourly;

  if (!d || !Array.isArray(d.time)) return [];

  return d.time.map((date: string, i: number) => {
    const temp_max = d.temperature_2m_max?.[i] ?? null;
    const temp_min = d.temperature_2m_min?.[i] ?? null;

    // ── Calculate temp_mean from max and min ───────────────────────────
    const temp_mean =
      temp_max !== null && temp_min !== null
        ? Math.round(((temp_max + temp_min) / 2) * 10) / 10
        : null;

    // ── Calculate humidity_mean by averaging 24 hourly values ─────────
    // Open-Meteo hourly array: each day occupies indices [i*24 .. i*24+23]
    let humidity_mean: number | null = null;
    if (h && Array.isArray(h.relative_humidity_2m)) {
      const startHour = i * 24;
      const endHour   = startHour + 24;
      const slice     = h.relative_humidity_2m.slice(
        startHour, endHour
      ) as (number | null)[];
      const valid     = slice.filter(
        (v): v is number => v !== null && !isNaN(v)
      );
      if (valid.length > 0) {
        const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
        humidity_mean = Math.round(avg * 10) / 10;
      }
    }

    return {
      date,
      temp_max,
      temp_min,
      temp_mean,
      humidity_mean,
      precipitation_sum: d.precipitation_sum?.[i]  ?? null,
      wind_speed_max:    d.wind_speed_10m_max?.[i]  ?? null,
    };
  });
}