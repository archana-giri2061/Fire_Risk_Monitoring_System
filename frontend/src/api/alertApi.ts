import api from "./client";

export async function runEmailAlerts() {
  const res = await api.post("/api/alerts/run-email");
  return res.data;
}