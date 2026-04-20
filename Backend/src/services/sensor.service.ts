// sensor.service.ts
// Data access layer for IoT sensor readings.
// Provides functions for storing and querying the iot_sensor_readings table.
// Used by sensor.routes.ts for all database operations on sensor data.

import { pool } from "../db";


// Union type restricting sensor_type values to the known categories.
// Matches the sensor_type strings sent by the ESP32 firmware and stored in the DB.
export type SensorType = "TEMP" | "HUMIDITY" | "CO2" | "SOIL" | "RAIN";

// Shape of a single sensor reading as stored in iot_sensor_readings.
// Used as the input type for storeSensorReadings() and as documentation
// for the structure expected from IoT device payloads.
export interface SensorReading {
  device_id:   string;      // Unique hardware identifier, e.g. "esp32_node_01"
  sensor_id:   string;      // Identifier for the specific sensor on the device, e.g. "dht22_1"
  sensor_type: SensorType;  // Category of measurement
  value:       number;      // Raw measured value
  unit:        string;      // Unit string, e.g. "C", "%", "ppm"
  measured_at: string;      // ISO timestamp when the reading was taken on the device
  seq:         number;      // Monotonically increasing sequence number for deduplication
}


// Inserts a batch of sensor readings into iot_sensor_readings inside a single transaction.
// Uses ON CONFLICT DO UPDATE (upsert) so retransmissions from the device (same
// device_id + sensor_id + seq) overwrite the previous value rather than failing
// with a unique constraint error. This makes the function safe to call on retry.
//
// Rolls back the entire batch if any single insert fails so partial writes never occur.
//
// Parameters:
//   readings: Array of SensorReading objects to insert
//
// Returns:
//   { ok: true, inserted: number } on success.
//   Throws the original error on failure after rolling back the transaction.
export async function storeSensorReadings(readings: SensorReading[]) {
  // Acquire a dedicated client so BEGIN/COMMIT/ROLLBACK are scoped to one connection
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sql = `
      INSERT INTO iot_sensor_readings
        (device_id, sensor_id, sensor_type, value, unit, measured_at, seq)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (device_id, sensor_id, seq)
      DO UPDATE SET
        value       = EXCLUDED.value,
        unit        = EXCLUDED.unit,
        measured_at = EXCLUDED.measured_at
    `;

    for (const r of readings) {
      await client.query(sql, [
        r.device_id,   // $1 — which device sent this
        r.sensor_id,   // $2 — which sensor on that device
        r.sensor_type, // $3 — category for frontend filtering
        r.value,       // $4 — the measured value
        r.unit,        // $5 — unit string
        r.measured_at, // $6 — device-reported timestamp, not server receive time
        r.seq,         // $7 — sequence counter used for conflict detection
      ]);
    }

    await client.query("COMMIT");
    return { ok: true, inserted: readings.length };

  } catch (err) {
    // Roll back the entire batch on any failure — no partial writes
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();  // Always return the connection to the pool
  }
}


// Returns all sensor readings ordered newest first, with optional pagination.
// The default limit of 2000 is intentionally high to support the IoT analytics
// page which needs a full history view. Callers should pass a smaller limit
// for performance-sensitive use cases.
//
// Parameters:
//   limit  : Maximum number of rows to return (default 2000)
//   offset : Number of rows to skip for pagination (default 0)
export async function getAllSensorReadings(limit = 2000, offset = 0) {
  const sql = `
    SELECT *
    FROM iot_sensor_readings
    ORDER BY measured_at DESC
    LIMIT $1 OFFSET $2
  `;
  const result = await pool.query(sql, [limit, offset]);
  return result.rows;
}


// Returns recent sensor readings filtered to a single device, newest first.
// Used when the frontend wants to show the full reading history for one device
// rather than the combined history of all devices.
//
// Parameters:
//   device_id : Hardware identifier of the device to query
//   limit     : Maximum number of rows to return (default 2000)
export async function getSensorReadingsByDevice(device_id: string, limit = 2000) {
  const sql = `
    SELECT *
    FROM iot_sensor_readings
    WHERE device_id = $1
    ORDER BY measured_at DESC
    LIMIT $2
  `;
  const result = await pool.query(sql, [device_id, limit]);
  return result.rows;
}


// Returns the single most recent reading per sensor type for a specific device.
// DISTINCT ON (sensor_type) with ORDER BY measured_at DESC ensures only the
// latest value for each type is returned, not the full history.
// Used by the frontend IoT live status card to show current conditions per sensor.
//
// Parameters:
//   device_id: Hardware identifier of the device to query
export async function getLatestByDevice(device_id: string) {
  const sql = `
    SELECT DISTINCT ON (sensor_type)
      *
    FROM iot_sensor_readings
    WHERE device_id = $1
    ORDER BY sensor_type, measured_at DESC
  `;
  const result = await pool.query(sql, [device_id]);
  return result.rows;
}