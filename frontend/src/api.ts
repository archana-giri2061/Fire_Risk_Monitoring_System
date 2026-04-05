/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  api.ts  —  वन दृष्टि Fire Risk Monitoring System           ║
 * ║  Single source of truth for ALL API calls                   ║
 * ║                                                              ║
 * ║  Usage in any page:                                          ║
 * ║    import { api } from "../api";                             ║
 * ║    const data = await api.dashboard.home();                  ║
 * ║    import { API } from "../api";   ← raw URL still works     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ── Base URL ────────────────────────────────────────────────────────────────
export const API: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:3000";

// ── Types ───────────────────────────────────────────────────────────────────

export interface Prediction {
  date:             string;
  risk_code:        number;
  risk_label:       string;
  risk_probability: number;
  model_name:       string;
  created_at?:      string;
}

export interface AlertLog {
  id:           number;
  location_key: string;
  risk_label:   string;
  alert_date:   string;
  message:      string;
  created_at:   string;
}

export interface WeatherRow {
  date:              string;
  location_key?:     string;
  latitude?:         number;
  longitude?:        number;
  temp_max?:         number;
  temp_min?:         number;
  temp_mean:         number;
  humidity_mean:     number;
  precipitation_sum: number;
  wind_speed_max:    number;
  data_source?:      string;
  updated_at?:       string;
}

export interface SensorReading {
  id?:             number;
  device_id:       string;
  sensor_id?:      string;
  sensor_type:     string;   // "temperature" | "humidity" | "co2" | "rain" | "soil" | "smoke"
  value:           number;
  unit?:           string;
  recorded_at:     string;
  measured_at?:    string;
  seq?:            number;
  // ── Enriched fields (from sensor.routes.ts) ──────────────────────────
  // DHT22
  temperature?:    number | null;   // °C
  humidity?:       number | null;   // %
  heat_index?:     number | null;   // °C (computed: temp + humidity factor)
  // MQ-135
  co2_ppm?:        number | null;   // ppm
  smoke_ppm?:      number | null;   // ppm (alias for co2 sensor output)
  // YL-83 rain drop sensor
  rain_value?:     number | null;   // 0-1023 (lower = more rain)
  is_raining?:     boolean;
  // Soil moisture sensor
  soil_moisture?:  number | null;   // 0-100% (higher = wetter)
  soil_dry?:       boolean;
  // Derived fire/alert flags
  fire_detected?:  boolean;
  wind_speed?:     number | null;   // km/h (if wind sensor added)
}

export interface DashboardOverview {
  monitoringStatus: string;
  lastUpdated:      string;
  dataSource:       string;
  temperature:      number;
  humidity:         number;
  windSpeed:        number;
  rainfall:         number;
  pressure:         number;
  activeAlerts:     number;
  riskLabel:        string;
  riskProbability:  number;
}

export interface DashboardData {
  overview:    DashboardOverview;
  predictions: Prediction[];
  trends:      { time: string; temperature: number; humidity: number; windSpeed: number }[];
  readings:    { time: string; location: string; temperature: number; humidity: number; windSpeed: number; rainfall: number; pressure: number; status: string }[];
  alerts:      { time: string; type: string; location: string; severity: string; message: string }[];
  areas:       { area: string; avgTemperature: number; avgHumidity: number; avgWindSpeed: number; condition: string; action: string; lat: number; lng: number }[];
}

export interface AlertResult {
  ok:          boolean;
  sent?:       boolean;
  alerts?:     number;
  message?:    string;
  recipients?: string[];
  days?:       { date: string; risk_label: string; risk_probability: number }[];
  riskLevel?:  string;
  error?:      string;
}

export interface MLResult {
  ok:       boolean;
  message?: string;
  stdout?:  string;
  stderr?:  string;
  alert?:   AlertResult;
  results?: Record<string, unknown>;
}

export interface SensorIngestBody {
  device_id:   string;
  seq:         number;
  measured_at: string;
  readings: {
    sensor_id:   string;
    sensor_type: string;
    value:       number;
    unit:        string;
  }[];
}

// ── Core fetch helper ────────────────────────────────────────────────────────
async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

const get  = <T>(path: string)                  => call<T>(path);
const post = <T>(path: string, body?: unknown)  =>
  call<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

// ═══════════════════════════════════════════════════════════════════════════
//  API — grouped by module
// ═══════════════════════════════════════════════════════════════════════════

export const api = {

  // ── Health ────────────────────────────────────────────────────────────────
  health: {
    /** GET /check */
    check: () =>
      get<{ ok: boolean; message: string; environment: string; frontend: string; timestamp: string }>("/check"),
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    /** GET /api/dashboard/home */
    home: () => get<DashboardData>("/api/dashboard/home"),
  },

  // ── Weather ───────────────────────────────────────────────────────────────
  weather: {
    /** GET /api/weather/db-test */
    dbTest: () =>
      get<{ ok: boolean; data: { now: string } }>("/api/weather/db-test"),

    /** POST /api/weather/sync-all */
    syncAll: () =>
      post<{ ok: boolean; message: string }>("/api/weather/sync-all"),

    /** GET /api/weather/archive?limit=60 */
    archive: (limit = 60) =>
      get<{ ok: boolean; count: number; location: string; data: WeatherRow[] }>(
        `/api/weather/archive?limit=${limit}`
      ),

    /** GET /api/weather/forecast */
    forecast: () =>
      get<{ ok: boolean; count: number; location: string; data: WeatherRow[] }>(
        "/api/weather/forecast"
      ),

    /** GET /api/weather/summary */
    summary: () =>
      get<{ ok: boolean; location: string; summary: Record<string, unknown> }>(
        "/api/weather/summary"
      ),
  },

  // ── ML ────────────────────────────────────────────────────────────────────
  ml: {
    /** POST /api/ml/train */
    train: () => post<MLResult>("/api/ml/train"),

    /** POST /api/ml/test-archive */
    testArchive: () => post<MLResult>("/api/ml/test-archive"),

    /** POST /api/ml/predict-forecast — predict + auto alert */
    predictForecast: () => post<MLResult>("/api/ml/predict-forecast"),

    /** POST /api/ml/run-all — train + test + predict + alert */
    runAll: () => post<MLResult>("/api/ml/run-all"),

    /** GET /api/ml/predictions?limit=7&from=2026-01-01 */
    predictions: (limit = 7, from?: string) =>
      get<{ ok: boolean; count: number; location: string; data: Prediction[] }>(
        `/api/ml/predictions?limit=${limit}${from ? `&from=${from}` : ""}`
      ),

    /** GET /api/ml/metrics */
    metrics: () =>
      get<{ ok: boolean; train: Record<string, unknown> | null; archive: Record<string, unknown> | null }>(
        "/api/ml/metrics"
      ),
  },

  // ── Alerts ────────────────────────────────────────────────────────────────
  alerts: {
    /** GET /api/alerts/status */
    status: () =>
      get<{ ok: boolean; location: string; total: number; highRiskDays: number; alertNeeded: boolean; predictions: Prediction[] }>(
        "/api/alerts/status"
      ),

    /** GET /api/alerts/history?limit=50 */
    history: (limit = 50) =>
      get<{ ok: boolean; count: number; data: AlertLog[] }>(
        `/api/alerts/history?limit=${limit}`
      ),

    /** POST /api/alerts/run-email */
    runEmail: (minRisk: "High" | "Extreme" = "High", extraTo: string[] = [], note?: string) =>
      post<AlertResult>("/api/alerts/run-email", { minRisk, extraTo, note }),

    /** POST /api/alerts/run-extreme */
    runExtreme: () => post<AlertResult>("/api/alerts/run-extreme"),

    /** POST /api/alerts/daily-report */
    dailyReport: () => post<AlertResult>("/api/alerts/daily-report"),

    /** POST /api/alerts/test-email */
    testEmail: () =>
      post<{ ok: boolean; message: string; to?: string }>("/api/alerts/test-email"),

    /** POST /api/alerts/test-extreme */
    testExtreme: () => post<{ ok: boolean; message: string }>("/api/alerts/test-extreme"),

    /** POST /api/alerts/test-daily-report */
    testDailyReport: () => post<AlertResult>("/api/alerts/test-daily-report"),

    /** POST /api/alerts/iot-fire */
    iotFire: (body: {
      deviceId:     string;
      deviceName:   string;
      location?:    string;
      smokePpm:     number;
      temperature:  number;
      fireDetected: boolean;
    }) => post<AlertResult>("/api/alerts/iot-fire", body),
  },

  // ── Sensor ────────────────────────────────────────────────────────────────
  sensor: {
    /** POST /api/sensor/ingest */
    ingest: (body: SensorIngestBody) =>
      post<{ ok: boolean; inserted: number }>("/api/sensor/ingest", body),

    /** GET /api/sensor/devices */
    devices: () =>
      get<{ ok: boolean; count: number; data: string[] }>("/api/sensor/devices"),

    /** GET /api/sensor/all?limit=100 */
    all: (limit = 100) =>
      get<{ ok: boolean; count: number; data: SensorReading[] }>(
        `/api/sensor/all?limit=${limit}`
      ),

    /** GET /api/sensor/readings?limit=50  (alias — IoT monitor uses this) */
    readings: (limit = 50) =>
      get<{ ok: boolean; count: number; data: SensorReading[] }>(
        `/api/sensor/readings?limit=${limit}`
      ),

    /** GET /api/sensor/latest/:deviceId */
    latest: (deviceId: string) =>
      get<{ ok: boolean; count: number; data: SensorReading[] }>(
        `/api/sensor/latest/${encodeURIComponent(deviceId)}`
      ),

    /** GET /api/sensor/summary */
    summary: () =>
      get<{ ok: boolean; count: number; data: { device_id: string; total_readings: number; last_seen: string }[] }>(
        "/api/sensor/summary"
      ),
  },
};

export default api;