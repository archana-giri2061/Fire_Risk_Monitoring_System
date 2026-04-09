import { pool } from "../db";

export type SensorType = "TEMP" | "HUMIDITY" | "CO2" | "SOIL" | "RAIN";

export interface SensorReading {
  device_id: string;
  sensor_id: string;
  sensor_type: SensorType;
  value: number;
  unit: string;
  measured_at: string; // ISO string
  seq: number;
}

export async function storeSensorReadings(readings: SensorReading[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sql = `
      INSERT INTO iot_sensor_readings
      (device_id, sensor_id, sensor_type, value, unit, measured_at, seq)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (device_id, sensor_id, seq)
      DO UPDATE SET
        value = EXCLUDED.value,
        unit = EXCLUDED.unit,
        measured_at = EXCLUDED.measured_at
    `;

    for (const r of readings) {
      await client.query(sql, [
        r.device_id,
        r.sensor_id,
        r.sensor_type,
        r.value,
        r.unit,
        r.measured_at,
        r.seq,
      ]);
    }

    await client.query("COMMIT");
    return { ok: true, inserted: readings.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** GET: all readings (optionally limit/offset) */
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

/** GET: filter by device */
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

/** GET: latest reading per sensor_type for a device */
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