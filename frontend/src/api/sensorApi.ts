import api from "./client";

export async function getAllSensors(limit = 100) {
  const res = await api.get(`/api/sensor/all?limit=${limit}`);
  return res.data.data ?? [];
}

export async function getSensorDevices() {
  const res = await api.get("/api/sensor/devices");
  return res.data.data ?? [];
}

export async function getLatestByDevice(deviceId: string) {
  const res = await api.get(`/api/sensor/latest/${deviceId}`);
  return res.data.data ?? [];
}