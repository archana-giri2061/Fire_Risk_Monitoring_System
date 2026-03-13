import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 3000),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  latitude: Number(process.env.LATITUDE || 28.002),
  longitude: Number(process.env.LONGITUDE || 83.036),
  locationKey: process.env.LOCATION_KEY || "lumbini_28.002_83.036",
  
  archiveDays: Number(process.env.ARCHIVE_DAYS || 60),
  forecastDays: Number(process.env.FORECAST_DAYS || 7),
  syncOnStart: String(process.env.SYNC_ON_START || "true") === "true",
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES || 30),
  datasetExportPath: process.env.DATASET_EXPORT_PATH || "ml/data/live_weather_dataset.csv",

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.ALERT_FROM_EMAIL || "",
    to: process.env.ALERT_TO_EMAIL || "",
  },
};