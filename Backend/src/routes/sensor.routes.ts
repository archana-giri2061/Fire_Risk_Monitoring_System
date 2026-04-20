// sensor.routes.ts
// Express router for IoT sensor data ingestion and retrieval.
// Handles incoming readings from ESP32/Arduino devices and exposes
// endpoints for the frontend IoT monitor page to query stored data.
// All routes are prefixed with /api/sensor via app.ts.

import { Router } from "express";
import { pool }   from "../db";

export const sensorRouter = Router();


sensorRouter.post("/ingest", async (req, res) => {
  /**
   * Receives a batch of sensor readings from an IoT device and stores them
   * in the iot_sensor_readings table.
   *
   * Validates that all required top-level fields are present before proceeding.
   * Auto-creates the table if it does not exist so the route works on first boot
   * without requiring a manual migration step.
   *
   * Performs a duplicate check on the first reading's sensor_id + seq combination
   * before starting the transaction. Returns 409 if the seq was already received
   * from this device, making the endpoint safe for devices to retry on network failure.
   *
   * All readings in the batch are inserted inside a single transaction so either
   * all succeed or all roll back — partial inserts never occur.
   *
   * Body params:
   *   device_id   : Unique hardware identifier, e.g. "esp32_node_01"
   *   seq         : Monotonically increasing sequence number from the device
   *   measured_at : ISO timestamp when the readings were taken on the device
   *   readings    : Array of { sensor_id, sensor_type, value, unit }
   */
  try {
    const { device_id, seq, measured_at, readings } = req.body;

    // Reject requests missing any required field before touching the database
    if (!device_id || seq === undefined || !measured_at || !Array.isArray(readings)) {
      return res.status(400).json({
        ok:    false,
        error: "Missing required fields: device_id, seq, measured_at, readings[]",
      });
    }

    // Auto-create the table on first ingest so the device can send data immediately
    // after deployment without requiring a separate database setup step.
    // The UNIQUE constraint on (device_id, sensor_id, seq) enforces deduplication at DB level.
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

    // Check the first reading's sensor_id + seq against existing rows before starting
    // the transaction. This returns a clean 409 rather than a constraint error mid-insert.
    // Only the first sensor_id is checked — if it is new the whole batch is treated as new.
    const firstSensorId = readings[0]?.sensor_id;
    if (firstSensorId) {
      const dupCheck = await pool.query(
        `SELECT id FROM iot_sensor_readings
         WHERE device_id = $1
           AND sensor_id = $2
           AND seq       = $3
         LIMIT 1`,
        [device_id, firstSensorId, Number(seq)],
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({
          ok:    false,
          error: "Duplicate reading — seq already exists for this device",
          device_id,
          seq,
        });
      }
    }

    // Acquire a dedicated client for the transaction so BEGIN/COMMIT/ROLLBACK
    // are scoped to a single connection and cannot interleave with other queries
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const sql = `
        INSERT INTO iot_sensor_readings
          (device_id, sensor_id, sensor_type, value, unit, measured_at, seq)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (const r of readings) {
        await client.query(sql, [
          device_id,      // $1 — which device sent this batch
          r.sensor_id,    // $2 — which sensor on that device
          r.sensor_type,  // $3 — category used for frontend filtering
          Number(r.value),
          r.unit,
          measured_at,    // $6 — device-reported timestamp, not server receive time
          Number(seq),    // $7 — sequence counter for deduplication
        ]);
      }

      await client.query("COMMIT");
      res.json({ ok: true, inserted: readings.length });

    } catch (e: any) {
      // Roll back the entire batch on any insert error — no partial writes
      await client.query("ROLLBACK");
      console.error("[Sensor] Insert error:", e.message);
      res.status(500).json({ ok: false, error: e.message });
    } finally {
      client.release();  // Always return the connection to the pool
    }

  } catch (e: any) {
    console.error("[Sensor] Route error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});


sensorRouter.get("/ingest", (_req, res) => {
  /**
   * GET handler on the /ingest path to prevent confusing 405 errors when
   * someone visits the URL in a browser or misconfigures the device firmware.
   * Returns a plain hint to use POST instead.
   */
  res.json({ ok: true, message: "Use POST /api/sensor/ingest to send data" });
});


sensorRouter.get("/devices", async (_req, res) => {
  /**
   * Returns a deduplicated list of all device IDs that have ever submitted readings.
   * Used by the frontend IoT monitor to populate the device selector dropdown.
   */
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT device_id FROM iot_sensor_readings ORDER BY device_id ASC",
    );
    res.json({
      ok:    true,
      count: rows.length,
      data:  rows.map((r) => r.device_id),  // Return a flat list of ID strings
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// Shared handler used by both GET /all and GET /readings so the frontend
// IoT monitor can use either path without duplicating the query logic.
async function getAllReadings(req: any, res: any) {
  /**
   * Returns recent sensor readings across all devices, newest first.
   * Normalises abbreviated sensor type strings (e.g. "temp", "hum") to their
   * full names and expands each row with typed convenience fields so the
   * frontend can access temperature, humidity, fire_detected etc. directly
   * without needing to switch on sensor_type itself.
   *
   * Query params:
   *   limit: Maximum rows to return (default 100, hard cap 500)
   */
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const { rows } = await pool.query(
      `SELECT id, device_id, sensor_id, sensor_type, value, unit,
              measured_at AS recorded_at, seq
       FROM iot_sensor_readings
       ORDER BY measured_at DESC LIMIT $1`,
      [limit],
    );

    const data = rows.map((r) => {
      const v = Number(r.value);
      const t = r.sensor_type.toLowerCase();

      // Normalise firmware abbreviations to full type names used by the frontend
      const normalizedType =
        t === "temp"  ? "temperature" :
        t === "hum"   ? "humidity"    :
        t === "co2"   ? "co2"         :
        t === "rain"  ? "rain"        :
        t === "soil"  ? "soil"        :
        t === "smoke" ? "smoke"       :
        t === "fire"  ? "fire"        : t;

      return {
        ...r,
        sensor_type:   normalizedType,
        recorded_at:   r.measured_at ?? r.recorded_at,

        // Typed value fields — null when the row is a different sensor type
        temperature:   t === "temperature" || t === "temp"      ? v : null,
        humidity:      t === "humidity"    || t === "hum"       ? v : null,
        heat_index:    t === "heat_index"                       ? v : null,
        co2_ppm:       t === "co2"                              ? v : null,
        smoke_ppm:     t === "smoke"       || t === "co2"       ? v : null,
        rain_value:    t === "rain"        || t === "rainfall"  ? v : null,

        // Boolean derived fields — false when not applicable to this sensor type
        is_raining:    t === "rain"        || t === "rainfall"  ? v < 500 : false,  // YL-83: < 500 = wet
        soil_moisture: t === "soil"        || t === "moisture"  ? v : null,
        soil_dry:      t === "soil"        || t === "moisture"  ? v < 30  : false,  // < 30% = dry
        wind_speed:    t === "wind"        || t === "wind_speed"? v : null,

        // Fire detected based on whichever sensor type is present
        fire_detected:
          t === "fire"  ? v > 0   :   // Flame sensor: any non-zero value = detected
          t === "smoke" ? v > 300 :   // MQ-2 smoke threshold in ppm
          t === "co2"   ? v > 800 :   // MQ-135 CO2 threshold in ppm
          false,
      };
    });

    res.json({ ok: true, count: data.length, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

// Register the same handler under two paths so both work without duplication
sensorRouter.get("/all",      getAllReadings);
sensorRouter.get("/readings", getAllReadings);


sensorRouter.get("/latest/:deviceId", async (req, res) => {
  /**
   * Returns the single most recent reading per sensor type for a specific device.
   * DISTINCT ON (sensor_type) with ORDER BY measured_at DESC ensures only the
   * latest value for each sensor type is returned, not the full history.
   * Used by the frontend to populate the live status card for a single device.
   *
   * Path params:
   *   deviceId: Hardware identifier of the device to query, e.g. "esp32_node_01"
   */
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (sensor_type)
         id, device_id, sensor_id, sensor_type, value, unit,
         measured_at AS recorded_at, seq
       FROM iot_sensor_readings
       WHERE device_id=$1
       ORDER BY sensor_type, measured_at DESC`,  // DISTINCT ON requires ORDER BY to start with the same column
      [req.params.deviceId],
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


sensorRouter.get("/summary", async (_req, res) => {
  /**
   * Returns a per-device summary showing total reading count and last seen timestamp.
   * Used by the frontend IoT monitor device list to show connection activity
   * and identify devices that have stopped sending data.
   */
  try {
    const { rows } = await pool.query(
      `SELECT device_id,
              COUNT(*)         AS total_readings,
              MAX(measured_at) AS last_seen
       FROM iot_sensor_readings
       GROUP BY device_id ORDER BY last_seen DESC`,
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});