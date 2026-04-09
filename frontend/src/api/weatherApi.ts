import api from "./client";

export async function getHealthCheck() {
  const res = await api.get("/check");
  return res.data;
}

export async function getArchiveWeather() {
  const res = await api.get("/api/weather/archive");
  return res.data.data ?? [];
}

export async function getForecastWeather() {
  const res = await api.get("/api/weather/forecast");
  return res.data.data ?? [];
}

export async function syncWeatherNow() {
  const res = await api.post("/api/weather/sync-all");
  return res.data;
}