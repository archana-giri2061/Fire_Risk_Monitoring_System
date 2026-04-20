// config.ts
// Loads all environment variables from Backend/.env and exposes them as a
// single typed config object used across the entire backend application.
// Uses an absolute path based on __dirname so the .env file is found
// regardless of what directory the server is started from.

import path   from "path";
import dotenv from "dotenv";

// Load Backend/.env — one level above the compiled dist/ or src/ directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {

  // Port the Express server listens on
  port:                Number(process.env.PORT || 3000),

  // URL of the React frontend — used in CORS allowed origins list
  frontendUrl:         process.env.FRONTEND_URL || "http://localhost:5173",

  // Geographic coordinates of the monitored location (default: Lumbini, Nepal).
  // Must match the values used when weather data was fetched and stored,
  // since ML prediction queries filter by these exact coordinates.
  latitude:            Number(process.env.LATITUDE  || 28.002),
  longitude:           Number(process.env.LONGITUDE || 83.036),

  // Human-readable location identifier used as a DB key and in email subjects
  locationKey:         process.env.LOCATION_KEY || "lumbini_28.002_83.036",

  // How many days of historical weather data to fetch from the Open-Meteo archive API
  archiveDays:         Number(process.env.ARCHIVE_DAYS || 60),

  // How many days ahead to fetch from the Open-Meteo forecast API
  forecastDays:        Number(process.env.FORECAST_DAYS || 7),

  // Whether to run a weather sync immediately when the server starts
  syncOnStart:         String(process.env.SYNC_ON_START || "true") === "true",

  // How often (in minutes) the background sync job runs after startup
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES || 30),

  // Output path for the CSV dataset exported for ML training scripts.
  // Relative to the Backend/ working directory.
  datasetExportPath:   process.env.DATASET_EXPORT_PATH || "ml/data/live_weather_dataset.csv",

  // Resend API key for sending emails via the Resend HTTP API.
  // If empty, the email service falls back to SMTP.
  resendApiKey: process.env.RESEND_API_KEY || "",

  // SMTP credentials used by the email service when no Resend key is configured.
  smtp: {
    host:   process.env.SMTP_HOST || "",            // e.g. smtp.gmail.com
    port:   Number(process.env.SMTP_PORT || 587),   // 587 = STARTTLS, 465 = SSL
    secure: String(process.env.SMTP_SECURE || "false") === "true",  // true only for port 465
    user:   process.env.SMTP_USER || "",            // SMTP login username
    pass:   process.env.SMTP_PASS || "",            // SMTP login password or app password
    from:   process.env.ALERT_FROM_EMAIL || "onboarding@resend.dev",  // From field in outgoing emails
    to:     process.env.ALERT_TO_EMAIL   || "",     // Default recipient for all alert emails
  },
};