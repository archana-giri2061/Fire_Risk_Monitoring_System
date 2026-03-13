import express from "express";
import "dotenv/config";
import cors from "cors";
import { config } from "./config";
import { mlRouter } from "./routes/ml.routes";
import { weatherRouter } from "./routes/weather.routes";
import { sensorRouter } from "./routes/sensor.routes";
import { alertsRouter } from "./routes/alerts.routes";
import { syncWeatherData } from "./services/WeatherSync.service";

const app = express();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/check", (_req, res) => {
  res.json({ ok: true, message: "Backend running" });
});

app.use("/api/weather", weatherRouter);
app.use("/api/sensor", sensorRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/ml", mlRouter);

app.listen(config.port, "0.0.0.0", async () => {
  console.log(`Server running at http://0.0.0.0:${config.port}`);

  if (config.syncOnStart) {
    try {
      const result = await syncWeatherData();
      console.log("✅ Initial weather sync completed", result);
    } catch (error) {
      console.error("❌ Initial weather sync failed", error);
    }
  }

  const intervalMs = config.syncIntervalMinutes * 60 * 1000;

  setInterval(async () => {
    try {
      console.log("🔄 Running scheduled weather sync...");
      await syncWeatherData();
      console.log("✅ Scheduled weather sync completed");
    } catch (error) {
      console.error("❌ Scheduled weather sync failed", error);
    }
  }, intervalMs);
});