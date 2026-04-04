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
    const data = rows.map((r) => ({
      ...r,
      temperature:    r.sensor_type === "temperature" ? Number(r.value) : null,
      humidity:       r.sensor_type === "humidity"    ? Number(r.value) : null,
      smoke_ppm:      r.sensor_type === "smoke"       ? Number(r.value) : null,
      co2_ppm:        r.sensor_type === "co2"         ? Number(r.value) : null,
      wind_speed:     r.sensor_type === "wind_speed"  ? Number(r.value) : null,
      fire_detected:  r.sensor_type === "fire"        ? Number(r.value) > 0 : false,
    }));
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