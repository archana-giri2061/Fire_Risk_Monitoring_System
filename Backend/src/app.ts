// app.ts
// Express application entry point for the Van Drishti Fire Risk Monitoring backend.
// Initialises the database tables, registers middleware and routes, starts the HTTP
// server, and launches the background weather sync and daily report schedulers.

import express      from "express";
import "dotenv/config";
import cors         from "cors";
import { config }   from "./config";
import { mlRouter }        from "./routes/ml.routes";
import { weatherRouter }   from "./routes/weather.routes";
import { sensorRouter }    from "./routes/sensor.routes";
import { alertsRouter }    from "./routes/alerts.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { syncWeatherData }     from "./services/WeatherSync.service";
import { sendDailyRiskReport } from "./services/dailyReport.service";
import { spawn } from "child_process";
import path         from "path";


// Creates all required database tables if they do not already exist.
// Called once after the server starts listening so the application is
// self-initialising on a fresh database without needing a manual migration step.
// The ALTER TABLE at the end drops a legacy unique constraint from an earlier
// schema version — wrapped in .catch(() => {}) so it is safe to run on databases
// that never had that constraint.
async function initDB(): Promise<void> {
  const { pool } = await import("./db");

  // IoT sensor readings table — UNIQUE on (device_id, sensor_id, seq) enforces
  // deduplication at the database level for retransmitted device payloads
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iot_sensor_readings (
      id          SERIAL PRIMARY KEY,
      device_id   TEXT NOT NULL,
      sensor_id   TEXT NOT NULL,
      sensor_type TEXT NOT NULL,
      value       DOUBLE PRECISION NOT NULL,
      unit        TEXT,
      measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      seq         BIGINT NOT NULL DEFAULT 0,
      UNIQUE (device_id, sensor_id, seq)
    );
  `);

  // Alert log table — records every sent alert for deduplication and audit
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_logs (
      id           SERIAL PRIMARY KEY,
      location_key TEXT NOT NULL,
      risk_label   TEXT NOT NULL,
      alert_date   DATE NOT NULL,
      message      TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Historical archive weather table — one row per (date, location, data_source)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_weather (
      id                SERIAL PRIMARY KEY,
      date              DATE NOT NULL,
      location_key      TEXT NOT NULL,
      latitude          DOUBLE PRECISION,
      longitude         DOUBLE PRECISION,
      temp_max          DOUBLE PRECISION,
      temp_min          DOUBLE PRECISION,
      temp_mean         DOUBLE PRECISION,
      humidity_mean     DOUBLE PRECISION,
      precipitation_sum DOUBLE PRECISION,
      wind_speed_max    DOUBLE PRECISION,
      data_source       TEXT DEFAULT 'archive',
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (date, location_key, data_source)
    );
  `);

  // Forecast weather table — replaced wholesale on each sync by replaceForecast()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_weather_forecast (
      id                SERIAL PRIMARY KEY,
      date              DATE NOT NULL,
      latitude          DOUBLE PRECISION NOT NULL,
      longitude         DOUBLE PRECISION NOT NULL,
      temp_max          DOUBLE PRECISION,
      temp_min          DOUBLE PRECISION,
      temp_mean         DOUBLE PRECISION,
      humidity_mean     DOUBLE PRECISION,
      precipitation_sum DOUBLE PRECISION,
      wind_speed_max    DOUBLE PRECISION,
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (date, latitude, longitude)
    );
  `);

  // Drop a legacy three-column unique constraint from an earlier schema version.
  // Safe to run on databases that never had it — the .catch() silences the error.
  await pool.query(`
    ALTER TABLE alert_logs
    DROP CONSTRAINT IF EXISTS alert_logs_location_key_alert_date_risk_label_key
  `).catch(() => {});

  console.log("[DB] All tables ready");
}


const app = express();

// CORS configuration — allows requests from the configured frontend URL, common
// local dev ports, and the EC2 instance's public and private IP addresses.
// x-admin-key is explicitly listed in allowedHeaders so admin and sensor POST
// routes work correctly from Postman and the React frontend.
// Requests with no Origin header (Postman, curl) are always allowed.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);  // Allow Postman and curl with no Origin
    const allowed = [
      config.frontendUrl,
      "http://localhost:5173",          // Vite dev server
      "http://localhost:4173",          // Vite preview server
      "http://localhost:3000",
      "http://52.202.127.155",          // EC2 public IP
      "http://52.202.127.155:3000",     // EC2 backend accessed directly
      "http://172.31.25.236",           // EC2 private IP (internal VPC access)
    ];
    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials:    true,
  methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-admin-key",   // Required for admin routes and sensor ingest from devices
  ],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Liveness probe used by load balancers and the frontend to verify the server
// is running and accepting connections. Does not check database connectivity.
app.get("/check", (_req, res) => {
  res.json({
    ok:          true,
    message:     "Backend running",
    environment: process.env.NODE_ENV || "development",
    frontend:    config.frontendUrl,
    timestamp:   new Date().toISOString(),
  });
});


// Diagnostic endpoint that reports row counts and the latest records from all
// five core tables. Useful for verifying that weather sync, ML predictions,
// and IoT ingestion are all writing data without needing direct DB access.
// Each table query is wrapped in its own try/catch so a missing table (e.g.
// fire_risk_predictions before first training run) returns { exists: false }
// rather than causing the whole endpoint to fail with a 500 error.
app.get("/api/db-status", async (_req, res) => {
  try {
    const { pool } = await import("./db");
    const tables = [
      "daily_weather",
      "daily_weather_forecast",
      "fire_risk_predictions",
      "iot_sensor_readings",
      "alert_logs",
    ];
    const result: Record<string, any> = {};

    for (const table of tables) {
      try {
        // Try the query with created_at first — not all tables have that column
        const r = await pool.query(
          `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_row FROM ${table}`
        );
        result[table] = {
          exists: true,
          rows:   Number(r.rows[0].cnt),
          latest: r.rows[0].last_row ?? "n/a",
        };
      } catch {
        try {
          // Fallback for tables without created_at (e.g. daily_weather_forecast)
          const r2 = await pool.query(`SELECT COUNT(*) AS cnt FROM ${table}`);
          result[table] = { exists: true, rows: Number(r2.rows[0].cnt), latest: "n/a" };
        } catch {
          // Table does not exist yet
          result[table] = { exists: false, rows: 0 };
        }
      }
    }

    // Fetch the 20 most recent sensor readings for quick IoT connectivity check
    let sensorSummary: any[] = [];
    try {
      const sr = await pool.query(`
        SELECT device_id, sensor_type, value, unit, measured_at
        FROM iot_sensor_readings
        ORDER BY measured_at DESC LIMIT 20
      `);
      sensorSummary = sr.rows;
    } catch { /**/ }

    // Fetch the 7 most recent predictions to verify the ML pipeline has run
    let predictions: any[] = [];
    try {
      const pr = await pool.query(`
        SELECT date, risk_label, risk_probability, created_at
        FROM fire_risk_predictions
        ORDER BY date DESC LIMIT 7
      `);
      predictions = pr.rows;
    } catch { /**/ }

    // Fetch the 5 most recent weather archive rows to verify sync has run
    let weather: any[] = [];
    try {
      const wr = await pool.query(`
        SELECT date, temp_mean, humidity_mean, wind_speed_max, data_source
        FROM daily_weather
        ORDER BY date DESC LIMIT 5
      `);
      weather = wr.rows;
    } catch { /**/ }

    res.json({
      ok:                     true,
      timestamp:              new Date().toISOString(),
      tables:                 result,
      latest_sensor_readings: sensorSummary,
      latest_predictions:     predictions,
      latest_weather:         weather,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// Register all route handlers — each adds its own /api/* prefix defined in the router file
app.use("/api/weather",   weatherRouter);    // Weather sync and retrieval
app.use("/api/sensor",    sensorRouter);     // IoT sensor data ingestion
app.use("/api/alerts",    alertsRouter);     // Alert emails and history
app.use("/api/ml",        mlRouter);         // ML training and predictions
app.use("/api/dashboard", dashboardRouter);  // Aggregated dashboard data

// Catch-all 404 handler — must be registered after all other routes
app.use((req, res) => {
  res.status(404).json({
    ok:    false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});


// Runs a Python ML script as a child process using the platform-appropriate interpreter.
// Uses python3 on Linux/Mac and python on Windows.
// Passes all required ML environment variables explicitly so scripts receive them
// regardless of what was set in the shell that started Node.
// Returns the exit code, stdout, and stderr when the process closes.
function runPython(
  scriptRelPath: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);
    const cmd        = process.platform === "win32" ? "python" : "python3";

    const p = spawn(cmd, ["-u", scriptPath], {
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",       // Ensures UTF-8 output on all platforms
        PYTHONUNBUFFERED: "1",           // Disables output buffering for real-time logs
        DATABASE_URL:  process.env.DATABASE_URL  ?? "",
        LATITUDE:      process.env.LATITUDE      ?? "28.002",
        LONGITUDE:     process.env.LONGITUDE     ?? "83.036",
        LOCATION_KEY:  process.env.LOCATION_KEY  ?? "lumbini_28.002_83.036",
        EXCEL_PATH:    process.env.EXCEL_PATH     ?? "ml/data/ForestfireData.xlsx",
        MODEL_PATH:    process.env.MODEL_PATH     ?? "ml/models/fire_risk_model_lr.joblib",
      },
      cwd: process.cwd(),
    });

    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}


// Runs the full weather sync and ML prediction pipeline in sequence:
//   1. Fetch and store fresh weather data via syncWeatherData()
//   2. Retrain the model via train_model.py
//   3. Generate the 7-day forecast via predict_forecast.py
//
// Stops at the first failure and logs the error — non-fatal so the server
// continues running even if the sync or prediction fails on a given cycle.
// The label parameter is included in log messages to identify whether this
// was triggered at startup or by the scheduled interval.
async function syncAndPredict(label: string): Promise<void> {
  console.log(`[${label}] Syncing weather and predictions`);

  try {
    await syncWeatherData();
    console.log(`[${label}] Weather synced`);
  } catch (e: any) {
    console.error(`[${label}] Weather sync failed: ${e.message}`);
    return;
  }

  const train = await runPython("ml/scripts/train_model.py");
  if (train.code !== 0) {
    console.error(`[${label}] Training failed:\n${train.stderr}`);
    return;
  }
  console.log(`[${label}] Model trained`);

  const predict = await runPython("ml/scripts/predict_forecast.py");
  if (predict.code !== 0) {
    console.error(`[${label}] Prediction failed:\n${predict.stderr}`);
    return;
  }
  console.log(`[${label}] Forecast predicted`);
}


// Sends the daily risk report email if one has not already been sent today.
// Checks alert_logs for a matching "Daily Report" message on today's date
// before sending to prevent duplicate emails if the server restarts mid-day.
// Non-fatal — errors are logged without propagating to the scheduler.
async function runDailyReport(): Promise<void> {
  const { pool } = await import("./db");
  const today    = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD

  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM alert_logs
     WHERE alert_date   = $1
       AND location_key = $2
       AND message LIKE '%Daily Report%'`,
    [today, config.locationKey],
  ).catch(() => ({ rows: [{ cnt: "0" }] }));

  if (Number(rows[0]?.cnt) > 0) {
    console.log("[Daily] Report already sent today — skipping");
    return;
  }

  console.log("[Daily] Sending daily report");
  const r = await sendDailyRiskReport();
  console.log(r.sent ? `[Daily] Sent | ${r.riskLevel}` : `[Daily] ${r.message}`);
}


// Schedules the daily report to send at noon each day.
// Calculates the milliseconds until the next 12:00:00 and sets a setTimeout.
// After each report fires it immediately re-schedules for the next noon,
// creating a self-sustaining daily loop without relying on setInterval drift.
function scheduleDailyReport(): void {

  // Returns milliseconds from now until the next 12:00:00.
  // If it is already past noon today, targets noon tomorrow.
  function msToNoon(): number {
    const now  = new Date();
    const next = new Date();
    next.setHours(12, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  function scheduleNext(): void {
    const ms = msToNoon();
    console.log(`[Daily] Next report in ${(ms / 3600000).toFixed(2)}h`);
    setTimeout(async () => {
      await runDailyReport();
      scheduleNext();  // Re-schedule immediately after sending
    }, ms);
  }

  scheduleNext();
}


// Runs once 5 seconds after the server starts listening.
// The 5-second delay gives the database connection pool time to fully initialise
// before the first sync attempts to query it.
// If it is already past noon on startup, also checks whether the daily report
// was missed (e.g. after a server restart) and sends it if not already logged.
async function onStartup(): Promise<void> {
  console.log("[Startup] Syncing weather and predictions");
  await syncAndPredict("Startup").catch((e: any) =>
    console.error("[Startup] Sync error (non-fatal):", e.message),
  );

  const hour = new Date().getHours();
  if (hour >= 12) {
    // Past noon — check if the daily report was already sent today
    console.log("[Startup] Past noon — checking for missed daily report");
    await runDailyReport().catch((e: any) =>
      console.error("[Startup] Daily report error (non-fatal):", e.message),
    );
  }
}


// Start the HTTP server, then initialise the database and background jobs.
// Binds to 0.0.0.0 so the server is reachable on all network interfaces
// including the EC2 public IP and the internal VPC address.
app.listen(config.port, "0.0.0.0", () => {
  console.log(`\n${"=".repeat(55)}`);
  console.log(` Van Drishti — Fire Risk Monitoring`);
  console.log(` Backend  : http://52.202.127.155:${config.port}`);
  console.log(` Port     : ${config.port}  |  Env: ${process.env.NODE_ENV}`);
  console.log(`${"=".repeat(55)}\n`);

  initDB().then(() => {
    // Delay the first sync by 5 seconds to allow the DB pool to stabilise
    setTimeout(() => onStartup(), 5000);

    // Re-run the full sync and prediction pipeline on a fixed interval
    setInterval(
      () => syncAndPredict("Scheduled"),
      config.syncIntervalMinutes * 60 * 1000,
    );

    scheduleDailyReport();
  }).catch((e: any) =>
    console.error("[DB] Init failed:", e.message),
  );
});