// Single source of truth for every API call made by the frontend.
// Import the api object in any page and call the relevant method —
// all URL construction, auth headers, and error handling are handled here.
//
// Usage:
//   import { api } from "../api";
//   const data = await api.dashboard.home();
//
//   import { API } from "../api";   // raw base URL if needed directly

// ─────────────────────────────────────────────────────────────────────────
// Base URL
// Reads from the Vite environment first (VITE_API_URL or VITE_API_BASE_URL),
// strips any trailing slash so paths can always be appended with a leading slash,
// and falls back to localhost for local development.
// ─────────────────────────────────────────────────────────────────────────
export const API: string =
  ((import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL) as string | undefined)
    ?.replace(/\/$/, "") ||
  "http://localhost:3000";

// ─────────────────────────────────────────────────────────────────────────
// Admin session helpers
// The admin key is stored in sessionStorage so it survives page refreshes
// within the same browser tab but is cleared when the tab is closed.
// The key is sent as the x-admin-key header on every API request.
// ─────────────────────────────────────────────────────────────────────────

// returns the stored admin key, or an empty string if none is present
export function getAdminKey(): string {
  return sessionStorage.getItem("vd_admin_key") || "";
}

// trims whitespace and saves the key to sessionStorage
export function setAdminKey(key: string): void {
  sessionStorage.setItem("vd_admin_key", key.trim());
}

// removes the key from sessionStorage, effectively logging the user out
export function clearAdminKey(): void {
  sessionStorage.removeItem("vd_admin_key");
}

// returns true when a non-empty admin key is currently stored
export function isAdmin(): boolean {
  return getAdminKey().length > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared types
// Defined here so every page can import them from the same place rather than
// duplicating interface definitions.
// ─────────────────────────────────────────────────────────────────────────

// one day's ML fire-risk prediction
export interface Prediction {
  date:             string;  // forecast date, formatted as YYYY-MM-DD
  risk_code:        number;  // numeric class: 0 = Low, 1 = Moderate, 2 = High, 3 = Extreme
  risk_label:       string;  // human-readable tier name matching risk_code
  risk_probability: number;  // model confidence for this tier as a decimal between 0 and 1
  model_name:       string;  // identifier of the model that produced this prediction, e.g. "XGBoost"
  created_at?:      string;  // ISO timestamp of when the prediction was saved — optional on older records
}

// one row from the alert history table — written each time an alert email is dispatched
export interface AlertLog {
  id:           number; // auto-incremented database primary key
  location_key: string; // slug identifying the monitored location, e.g. "lumbini_np"
  risk_label:   string; // the risk tier that triggered this alert
  alert_date:   string; // the forecast date the alert was about, formatted as YYYY-MM-DD
  message:      string; // short summary line that was included in the email body
  created_at:   string; // ISO timestamp of when this record was saved
}

// one day of processed weather data stored in the local archive
export interface WeatherRow {
  date:              string;  // calendar date, formatted as YYYY-MM-DD
  location_key?:     string;  // monitored area slug, e.g. "lumbini_np"
  latitude?:         number;  // geographic latitude of the observation point
  longitude?:        number;  // geographic longitude of the observation point
  temp_max?:         number;  // daily high temperature in degrees Celsius
  temp_min?:         number;  // daily low temperature in degrees Celsius
  temp_mean:         number;  // daily mean temperature in degrees Celsius
  humidity_mean:     number;  // daily mean relative humidity as a percentage
  precipitation_sum: number;  // total rainfall for the day in millimetres
  wind_speed_max:    number;  // peak wind speed for the day in km/h
  data_source?:      string;  // which API provided this record, e.g. "open-meteo"
  updated_at?:       string;  // ISO timestamp of the last time this row was refreshed
}

// one raw sensor reading row as returned by the backend — may include
// enriched computed fields that were added server-side before the response was sent
export interface SensorReading {
  id?:            number;       // auto-incremented database primary key — absent on newly ingested rows
  device_id:      string;       // identifies the physical ESP32, e.g. "ESP32-001"
  sensor_id?:     string;       // identifies the specific sensor on that board, e.g. "S1"
  sensor_type:    string;       // what this reading measures: "temperature" | "humidity" | "co2" | "rain" | "soil" | "smoke"
  value:          number;       // raw numeric reading — units depend on sensor_type
  unit?:          string;       // human-readable unit, e.g. "C", "%", "ppm", "raw"
  recorded_at:    string;       // ISO timestamp of when the backend stored this reading
  measured_at?:   string;       // ISO timestamp of when the ESP32 actually took the reading
  seq?:           number;       // sequence number from the ESP32 payload — used to detect dropped packets

  // DHT22 temperature and humidity sensor — populated server-side from the value column
  temperature?:   number | null; // degrees Celsius
  humidity?:      number | null; // relative humidity as a percentage
  heat_index?:    number | null; // feels-like temperature computed from temp + humidity

  // MQ-135 air quality sensor
  co2_ppm?:       number | null; // CO₂ concentration in parts per million
  smoke_ppm?:     number | null; // smoke concentration in ppm (same physical sensor, different reading path)

  // YL-83 rain drop sensor — raw ADC value: 0 = saturated, 1023 = completely dry
  rain_value?:    number | null;
  is_raining?:    boolean;       // true when rain_value falls below the wet threshold

  // capacitive soil moisture sensor
  soil_moisture?: number | null; // percentage 0–100 where 100 = fully saturated
  soil_dry?:      boolean;       // true when soil_moisture drops below the dry threshold

  // derived fire and alert flags computed server-side from the sensor readings
  fire_detected?: boolean;
  wind_speed?:    number | null; // km/h — only present when a wind sensor is connected
}

// live overview section of the dashboard API response
export interface DashboardOverview {
  monitoringStatus: string; // human-readable system status, e.g. "Active"
  lastUpdated:      string; // ISO timestamp of the most recent data sync
  dataSource:       string; // where the current weather data came from, e.g. "open-meteo"
  temperature:      number; // current temperature in degrees Celsius
  humidity:         number; // current relative humidity as a percentage
  windSpeed:        number; // current wind speed in km/h
  rainfall:         number; // rainfall total for today in millimetres
  pressure:         number; // atmospheric pressure in hPa
  activeAlerts:     number; // count of unacknowledged alerts
  riskLabel:        string; // current risk tier: "Low" | "Moderate" | "High" | "Extreme"
  riskProbability:  number; // model confidence for the current risk tier as a decimal
}

// full payload returned by GET /api/dashboard/home
export interface DashboardData {
  overview:    DashboardOverview;
  predictions: Prediction[];
  trends:      { time: string; temperature: number; humidity: number; windSpeed: number }[];
  readings:    { time: string; location: string; temperature: number; humidity: number; windSpeed: number; rainfall: number; pressure: number; status: string }[];
  alerts:      { time: string; type: string; location: string; severity: string; message: string }[];
  areas:       { area: string; avgTemperature: number; avgHumidity: number; avgWindSpeed: number; condition: string; action: string; lat: number; lng: number }[];
}

// response shape returned by alert-sending endpoints
export interface AlertResult {
  ok:          boolean;    // true when the request was processed without an internal error
  sent?:       boolean;    // true when at least one email was actually dispatched
  alerts?:     number;     // how many alert emails were sent in this batch
  message?:    string;     // human-readable status or reason string
  recipients?: string[];   // email addresses that received the alert
  days?:       { date: string; risk_label: string; risk_probability: number }[]; // forecast days included in the email
  riskLevel?:  string;     // highest risk tier covered by this alert
  error?:      string;     // error detail when ok is false
}

// response shape returned by ML pipeline endpoints (train, predict, run-all)
export interface MLResult {
  ok:       boolean;                    // true when the pipeline step completed without error
  message?: string;                     // human-readable status message
  stdout?:  string;                     // raw stdout from the Python ML script
  stderr?:  string;                     // raw stderr from the Python ML script — check when ok is false
  alert?:   AlertResult;                // populated when the pipeline also dispatched an alert
  results?: Record<string, unknown>;    // arbitrary result data from the pipeline step
}

// request body shape for POST /api/sensor/ingest
// matches the JSON payload the ESP32 firmware sends
export interface SensorIngestBody {
  device_id:   string; // identifies the sending ESP32, e.g. "ESP32-001"
  seq:         number; // monotonically increasing counter from the device — used to detect gaps
  measured_at: string; // ISO timestamp of when the device took the readings
  readings: {
    sensor_id:   string; // sensor slot on the board, e.g. "S1"
    sensor_type: string; // what this reading measures, e.g. "temperature"
    value:       number; // raw numeric value
    unit:        string; // unit string, e.g. "C", "%", "ppm"
  }[];
}

// ─────────────────────────────────────────────────────────────────────────
// Core fetch helper
// All API calls go through this function so auth headers, base URL
// construction, and error formatting are handled in one place.
// Throws an Error with the HTTP status and a snippet of the response body
// so callers can show a meaningful message without parsing the response.
// ─────────────────────────────────────────────────────────────────────────
async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const adminKey = getAdminKey();
  const baseHeaders: Record<string, string> = { "Content-Type": "application/json" };

  // attach the admin key header when the user is logged in
  if (adminKey) baseHeaders["x-admin-key"] = adminKey;

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...baseHeaders, ...(options?.headers as Record<string, string> ?? {}) },
  });

  if (!res.ok) {
    // read the response body for context, but cap at 200 chars to keep error messages readable
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

// shorthand wrappers so call sites read like get("/path") or post("/path", body)
const get  = <T>(path: string)                 => call<T>(path);
const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

// ─────────────────────────────────────────────────────────────────────────
// API — grouped by module
// Each module maps directly to a backend router so it is easy to find
// the corresponding server-side handler for any frontend call.
// ─────────────────────────────────────────────────────────────────────────
export const api = {

  // health — basic connectivity check, useful for diagnosing deployment issues
  health: {
    // GET /check — returns server status and environment info
    check: () =>
      get<{ ok: boolean; message: string; environment: string; frontend: string; timestamp: string }>("/check"),
  },

  // dashboard — aggregated home screen data
  dashboard: {
    // GET /api/dashboard/home — returns overview, predictions, trends, readings, alerts, and areas in one call
    home: () => get<DashboardData>("/api/dashboard/home"),
  },

  // weather — historical archive and forecast data management
  weather: {
    // GET /api/weather/db-test — quick database connectivity check
    dbTest: () =>
      get<{ ok: boolean; data: { now: string } }>("/api/weather/db-test"),

    // POST /api/weather/sync-all — triggers a full fetch of historical and forecast weather from the external API
    syncAll: () =>
      post<{ ok: boolean; message: string }>("/api/weather/sync-all"),

    // GET /api/weather/archive?limit=60 — returns the most recent N days of stored historical weather
    archive: (limit = 60) =>
      get<{ ok: boolean; count: number; location: string; data: WeatherRow[] }>(
        `/api/weather/archive?limit=${limit}`,
      ),

    // GET /api/weather/forecast — returns the upcoming days of forecast weather stored from the last sync
    forecast: () =>
      get<{ ok: boolean; count: number; location: string; data: WeatherRow[] }>(
        "/api/weather/forecast",
      ),

    // GET /api/weather/summary — returns aggregate statistics for the monitored location
    summary: () =>
      get<{ ok: boolean; location: string; summary: Record<string, unknown> }>(
        "/api/weather/summary",
      ),
  },

  // ml — model training, prediction, and metrics endpoints
  ml: {
    // POST /api/ml/train — retrains the XGBoost model on the current weather archive
    train: () => post<MLResult>("/api/ml/train"),

    // POST /api/ml/test-archive — runs the trained model against the historical archive to validate performance
    testArchive: () => post<MLResult>("/api/ml/test-archive"),

    // POST /api/ml/predict-forecast — generates a 7-day risk forecast and optionally sends an alert
    predictForecast: () => post<MLResult>("/api/ml/predict-forecast"),

    // POST /api/ml/run-all — convenience endpoint that runs train → test → predict → alert in sequence
    runAll: () => post<MLResult>("/api/ml/run-all"),

    // GET /api/ml/predictions?limit=7&from=YYYY-MM-DD — returns the N most recent stored predictions
    predictions: (limit = 7, from?: string) =>
      get<{ ok: boolean; count: number; location: string; data: Prediction[] }>(
        `/api/ml/predictions?limit=${limit}${from ? `&from=${from}` : ""}`,
      ),

    // GET /api/ml/metrics — returns training metrics including accuracy, confusion matrix, and feature importance
    metrics: () =>
      get<{ ok: boolean; train: Record<string, unknown> | null; archive: Record<string, unknown> | null }>(
        "/api/ml/metrics",
      ),
  },

  // alerts — email alert management and history
  alerts: {
    // GET /api/alerts/status — returns whether an alert is currently needed based on upcoming predictions
    status: () =>
      get<{ ok: boolean; location: string; total: number; highRiskDays: number; alertNeeded: boolean; predictions: Prediction[] }>(
        "/api/alerts/status",
      ),

    // GET /api/alerts/history?limit=50 — returns the N most recent alert log records
    history: (limit = 50) =>
      get<{ ok: boolean; count: number; data: AlertLog[] }>(
        `/api/alerts/history?limit=${limit}`,
      ),

    // POST /api/alerts/run-email — sends an alert for all forecast days at or above minRisk
    // extraTo adds additional recipients beyond the configured list; note is appended to the email body
    runEmail: (minRisk: "High" | "Extreme" = "High", extraTo: string[] = [], note?: string) =>
      post<AlertResult>("/api/alerts/run-email", { minRisk, extraTo, note }),

    // POST /api/alerts/run-extreme — sends an alert only when Extreme risk days are forecast
    runExtreme: () => post<AlertResult>("/api/alerts/run-extreme"),

    // POST /api/alerts/daily-report — sends the full 7-day summary report regardless of risk tier
    dailyReport: () => post<AlertResult>("/api/alerts/daily-report"),

    // POST /api/alerts/test-email — sends a smoke-test email to verify SMTP delivery is working
    testEmail: () =>
      post<{ ok: boolean; message: string; to?: string }>("/api/alerts/test-email"),

    // POST /api/alerts/test-extreme — sends a fake Extreme-risk alert for end-to-end pipeline testing
    testExtreme: () => post<{ ok: boolean; message: string }>("/api/alerts/test-extreme"),

    // POST /api/alerts/test-daily-report — sends a test version of the daily summary email
    testDailyReport: () => post<AlertResult>("/api/alerts/test-daily-report"),

    // POST /api/alerts/iot-fire — fires an emergency alert triggered by a specific IoT sensor reading
    iotFire: (body: {
      deviceId:     string;  // the ESP32 device that detected the fire
      deviceName:   string;  // human-readable name for the email body
      location?:    string;  // zone description included in the alert
      smokePpm:     number;  // smoke concentration reading that triggered the alert
      temperature:  number;  // temperature reading at time of detection
      fireDetected: boolean; // whether the fire flag was set on the sensor reading
    }) => post<AlertResult>("/api/alerts/iot-fire", body),
  },

  // sensor — ESP32 data ingestion and retrieval
  sensor: {
    // POST /api/sensor/ingest — receives a batch of sensor readings from an ESP32 device
    ingest: (body: SensorIngestBody) =>
      post<{ ok: boolean; inserted: number }>("/api/sensor/ingest", body),

    // GET /api/sensor/devices — returns the list of unique device_ids that have sent data
    devices: () =>
      get<{ ok: boolean; count: number; data: string[] }>("/api/sensor/devices"),

    // GET /api/sensor/all?limit=100 — returns the N most recent readings across all devices
    all: (limit = 100) =>
      get<{ ok: boolean; count: number; data: SensorReading[] }>(
        `/api/sensor/all?limit=${limit}`,
      ),

    // GET /api/sensor/readings?limit=50 — alias for all, used by the IoT Monitor page
    readings: (limit = 50) =>
      get<{ ok: boolean; count: number; data: SensorReading[] }>(
        `/api/sensor/readings?limit=${limit}`,
      ),

    // GET /api/sensor/latest/:deviceId — returns the most recent readings for one specific device
    latest: (deviceId: string) =>
      get<{ ok: boolean; count: number; data: SensorReading[] }>(
        `/api/sensor/latest/${encodeURIComponent(deviceId)}`,
      ),

    // GET /api/sensor/summary — returns a per-device summary with total reading count and last-seen time
    summary: () =>
      get<{ ok: boolean; count: number; data: { device_id: string; total_readings: number; last_seen: string }[] }>(
        "/api/sensor/summary",
      ),
  },
};

export default api;