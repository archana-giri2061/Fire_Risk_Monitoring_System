// weatherApi.ts
// Frontend API client functions for weather data retrieval and synchronisation.
// All functions call the Express backend weather routes via the shared axios
// instance in client.ts.

import api from "./client";


// Calls the backend liveness probe to verify the server is reachable.
// Used by the frontend to show a connection status indicator and to gate
// API-dependent features until connectivity is confirmed.
export async function getHealthCheck() {
  const res = await api.get("/check");
  return res.data;
}


// Fetches stored historical archive weather records for the configured location.
// Returns the data array directly so callers do not need to unwrap the response envelope.
// Returns an empty array if no archive data exists yet or the sync has not been run.
export async function getArchiveWeather() {
  const res = await api.get("/api/weather/archive");
  return res.data.data ?? [];
}


// Fetches stored forecast weather rows for the configured location.
// Returns the data array directly so callers do not need to unwrap the response envelope.
// Returns an empty array if no forecast data exists yet or the sync has not been run.
export async function getForecastWeather() {
  const res = await api.get("/api/weather/forecast");
  return res.data.data ?? [];
}


// Triggers a full weather sync on the backend.
// Fetches fresh archive and forecast data from the Open-Meteo API and upserts
// it into the database. Protected by requireAdmin on the backend — the caller
// must have set the x-admin-key header before invoking this function.
export async function syncWeatherNow() {
  const res = await api.post("/api/weather/sync-all");
  return res.data;
}