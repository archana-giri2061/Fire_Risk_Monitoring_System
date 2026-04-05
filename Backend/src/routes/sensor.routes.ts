import { Router } from "express";
import { pool } from "../db";

export const sensorRouter = Router();

// ── POST /api/sensor/ingest ────────────────────────────────────────────────
sensorRouter.post("/ingest", async (req, res) => {
  try {
    const { device_id, seq, measured_at, readings } = req.body;
    if (!device_id || seq === undefined || !measured_at || !Array.isArray(readings)) {
      return res.status(400).json({ ok: false, error: "Missing required fields: device_id, seq, measured_at, readings[]" });
    }

    // Auto-create table if it doesn't exist
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sql = `
        INSERT INTO iot_sensor_readings (device_id,sensor_id,sensor_type,value,unit,measured_at,seq)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (device_id,sensor_id,seq)
        DO UPDATE SET value=EXCLUDED.value, unit=EXCLUDED.unit, measured_at=EXCLUDED.measured_at
      `;
      for (const r of readings) {
        await client.query(sql, [device_id, r.sensor_id, r.sensor_type, Number(r.value), r.unit, measured_at, Number(seq)]);
      }
      await client.query("COMMIT");
      res.json({ ok: true, inserted: readings.length });
    } catch (e: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      client.release();
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/sensor/ingest (info) ──────────────────────────────────────────
sensorRouter.get("/ingest", (_req, res) => {
  res.json({ ok: true, message: "Use POST /api/sensor/ingest to send data" });
});

// ── GET /api/sensor/devices ────────────────────────────────────────────────
sensorRouter.get("/devices", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT device_id FROM iot_sensor_readings ORDER BY device_id ASC",
    );
    res.json({ ok: true, count: rows.length, data: rows.map((r) => r.device_id) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/sensor/all  (+ alias /api/sensor/readings for IoT monitor) ────
async function getAllReadings(req: any, res: any) {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const { rows } = await pool.query(
      `SELECT id, device_id, sensor_id, sensor_type, value, unit,
              measured_at AS recorded_at, seq
       FROM iot_sensor_readings
       ORDER BY measured_at DESC LIMIT $1`,
      [limit],
    );
    // Build enriched rows that IoTMonitor page expects
    const data = rows.map((r) => {
      const v = Number(r.value);
      const t = r.sensor_type.toLowerCase();
      return {
        ...r,
        recorded_at:   r.measured_at ?? r.recorded_at,
        // DHT22 — temperature & humidity
        temperature:   t === "temperature" || t === "temp"     ? v : null,
        humidity:      t === "humidity"    || t === "hum"      ? v : null,
        heat_index:    t === "heat_index"                      ? v : null,
        // MQ-135 — CO2 / smoke
        co2_ppm:       t === "co2"                             ? v : null,
        smoke_ppm:     t === "smoke"       || t === "co2"      ? v : null,
        // YL-83 — rain drop (0-1023, lower = more rain)
        rain_value:    t === "rain"        || t === "rainfall"  ? v : null,
        is_raining:    t === "rain"        || t === "rainfall"  ? v < 500 : false,
        // Soil moisture
        soil_moisture: t === "soil"        || t === "moisture"  ? v : null,
        soil_dry:      t === "soil"        || t === "moisture"  ? v < 30  : false,
        // Wind (if added later)
        wind_speed:    t === "wind"        || t === "wind_speed"? v : null,
        // Fire detection (relay trigger or smoke > threshold)
        fire_detected: t === "fire"        ? v > 0
                     : t === "smoke"       ? v > 300
                     : t === "co2"         ? v > 800
                     : false,
      };
    });
    res.json({ ok: true, count: data.length, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

sensorRouter.get("/all",      getAllReadings);
sensorRouter.get("/readings", getAllReadings); // alias for IoT monitor

// ── GET /api/sensor/latest/:deviceId ──────────────────────────────────────
sensorRouter.get("/latest/:deviceId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (sensor_type)
         id, device_id, sensor_id, sensor_type, value, unit,
         measured_at AS recorded_at, seq
       FROM iot_sensor_readings
       WHERE device_id=$1
       ORDER BY sensor_type, measured_at DESC`,
      [req.params.deviceId],
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/sensor/summary ────────────────────────────────────────────────
sensorRouter.get("/summary", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT device_id,
              COUNT(*) AS total_readings,
              MAX(measured_at) AS last_seen
       FROM iot_sensor_readings
       GROUP BY device_id ORDER BY last_seen DESC`,
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});