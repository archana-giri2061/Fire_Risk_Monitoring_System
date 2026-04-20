// Represents one sensor reading row as it is stored in the database.
// Each time an ESP32 device sends a payload to POST /api/sensor/ingest,
// the backend unpacks it and inserts one SensorRecord per reading entry.
export type SensorRecord = {
  id:          number; // auto-incremented primary key assigned by the database
  device_id:   string; // identifies which physical ESP32 sent this reading, e.g. "ESP32-001"
  sensor_id:   string; // identifies the specific sensor on that board, e.g. "S1", "S2"
  sensor_type: string; // what the sensor measures, e.g. "temperature", "humidity", "co2", "rain", "soil"
  value:       number; // the raw numeric reading — units depend on sensor_type
  unit:        string; // human-readable unit string, e.g. "C", "%", "ppm", "raw"
  measured_at: string; // ISO 8601 timestamp of when the ESP32 took the reading
  seq:         number; // sequence number from the ESP32 payload — used to detect dropped or duplicate packets
};