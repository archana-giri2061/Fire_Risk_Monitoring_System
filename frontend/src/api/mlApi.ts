import api from "./client";

export async function trainModel() {
  const res = await api.post("/api/ml/train");
  return res.data;
}

export async function testArchiveModel() {
  const res = await api.post("/api/ml/test-archive");
  return res.data;
}

export async function predictForecast() {
  const res = await api.post("/api/ml/predict-forecast");
  return res.data;
}

export async function getPredictions(limit = 30) {
  const res = await api.get(`/api/ml/predictions?limit=${limit}`);
  return res.data.data ?? [];
}