// mlApi.ts
// Frontend API client functions for the ML pipeline operations.
// All functions call the Express backend ML routes via the shared axios
// instance in client.ts. Admin-protected routes require the x-admin-key
// header to be set by the caller before these functions are invoked.

import api from "./client";


// Triggers a full model retraining run on the backend.
// Runs ml/scripts/train_model.py via the Express ML route.
// Protected by requireAdmin — the caller must have set the x-admin-key header.
export async function trainModel() {
  const res = await api.post("/api/ml/train");
  return res.data;
}


// Evaluates the trained model against the historical archive dataset.
// Runs ml/scripts/test_with_archive.py and writes results to ml/outputs/.
// Protected by requireAdmin — the caller must have set the x-admin-key header.
export async function testArchiveModel() {
  const res = await api.post("/api/ml/test-archive");
  return res.data;
}


// Generates the 7-day fire risk forecast from stored weather data.
// Runs ml/scripts/predict_forecast.py and auto-triggers alert emails
// for any High or Extreme risk days found in the new predictions.
// Protected by requireAdmin — the caller must have set the x-admin-key header.
export async function predictForecast() {
  const res = await api.post("/api/ml/predict-forecast");
  return res.data;
}


// Fetches stored fire risk predictions for the configured location.
// Returns the data array directly so callers do not need to unwrap the response envelope.
// Returns an empty array if no predictions exist yet or the table is missing.
//
// Parameters:
//   limit: Maximum number of prediction rows to return (default 30)
export async function getPredictions(limit = 30) {
  const res = await api.get(`/api/ml/predictions?limit=${limit}`);
  return res.data.data ?? [];
}