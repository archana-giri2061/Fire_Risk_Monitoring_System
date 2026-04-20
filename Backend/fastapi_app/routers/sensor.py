# sensor.py
# FastAPI router for IoT sensor data ingestion and retrieval.
# Handles incoming readings from ESP32/Arduino devices and exposes
# endpoints for the frontend IoT monitor page to query stored data.
# All routes are prefixed with /api/sensor.

from typing import List
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database import get_pool  # Returns the active asyncpg connection pool

router = APIRouter(prefix="/api/sensor", tags=["Sensor"])


class SensorReading(BaseModel):
    """
    Represents a single sensor measurement within a device's reading batch.
    One device can send multiple readings (e.g. temperature + humidity) in one request.
    """
    sensor_id:   str    # Unique identifier for the sensor on the device, e.g. "dht22_1"
    sensor_type: str    # Sensor category, e.g. "temperature", "humidity", "smoke", "rain"
    value:       float  # Raw measured value, e.g. 32.5 for temperature in Celsius
    unit:        str    # Unit of measurement, e.g. "C", "%", "ppm", "mm"


class SensorIngestBody(BaseModel):
    """
    Full payload sent by an IoT device when reporting a batch of sensor readings.
    The seq field is a monotonically increasing counter used to detect and handle duplicates.
    """
    device_id:   str                  # Unique hardware identifier, e.g. "esp32_node_01"
    seq:         int                  # Sequence number incremented by the device on each transmission
    measured_at: datetime             # Timestamp when the readings were taken on the device
                                      # Pydantic automatically parses ISO strings like "2026-04-04T10:30:00"
    readings:    List[SensorReading]  # One or more sensor measurements in this batch


@router.get("/ingest")
async def sensor_ingest_info():
    """
    GET handler on the /ingest path to prevent confusing 405 errors when
    someone visits the URL in a browser or misconfigures the device firmware.
    Returns a plain hint to use POST instead.
    """
    return {"ok": True, "message": "Use POST /api/sensor/ingest"}


@router.post("/ingest")
async def sensor_ingest(body: SensorIngestBody):
    """
    Receives a batch of sensor readings from an IoT device and stores them
    in the iot_sensor_readings table.

    Uses ON CONFLICT DO UPDATE (upsert) so that retransmissions from the device
    (same device_id + sensor_id + seq) overwrite the previous value rather than
    failing with a unique constraint error. This makes the endpoint idempotent,
    safe for devices to retry on network failure.

    Each reading in the batch is inserted individually within the same connection.
    """
    try:
        pool = await get_pool()

        # Acquire a single connection for the entire batch to avoid connection pool churn
        async with pool.acquire() as conn:
            for r in body.readings:
                await conn.execute(
                    "INSERT INTO iot_sensor_readings "
                    "(device_id, sensor_id, sensor_type, value, unit, measured_at, seq) "
                    "VALUES ($1, $2, $3, $4, $5, $6, $7) "
                    "ON CONFLICT (device_id, sensor_id, seq) "
                    # If this exact (device_id, sensor_id, seq) already exists, update the
                    # value/unit/timestamp in case the device corrected a previous reading
                    "DO UPDATE SET value=$4, unit=$5, measured_at=$6",
                    body.device_id,    # $1 — which device sent this
                    r.sensor_id,       # $2 — which sensor on that device
                    r.sensor_type,     # $3 — category for frontend filtering
                    r.value,           # $4 — the measured value
                    r.unit,            # $5 — unit string
                    body.measured_at,  # $6 — device-reported timestamp, not server receive time
                    body.seq,          # $7 — sequence counter for deduplication
                )

        return {"ok": True, "inserted": len(body.readings)}

    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/devices")
async def sensor_devices():
    """
    Returns a deduplicated list of all device IDs that have ever submitted readings.
    Used by the frontend IoT monitor to populate the device selector dropdown.
    """
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT DISTINCT device_id FROM iot_sensor_readings ORDER BY device_id ASC"
        )
        return {
            "ok":    True,
            "count": len(rows),
            "data":  [r["device_id"] for r in rows],  # Return a flat list of ID strings
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/all")
async def sensor_all(limit: int = Query(100)):
    """
    Returns the most recent sensor readings across all devices, newest first.
    Used by the frontend IoT monitor for the live readings table.

    Query params:
        limit: Maximum number of rows to return (default 100)

    Note: measured_at is converted to a string because asyncpg returns it as a
    Python datetime object which is not directly JSON-serialisable.
    """
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT id, device_id, sensor_id, sensor_type, value, unit, measured_at, seq "
            "FROM iot_sensor_readings "
            "ORDER BY measured_at DESC LIMIT $1",
            limit,
        )
        data = []
        for r in rows:
            d = dict(r)
            d["measured_at"] = str(d["measured_at"])  # Convert datetime to ISO string for JSON
            data.append(d)
        return {"ok": True, "count": len(data), "data": data}

    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/latest/{device_id}")
async def sensor_latest(device_id: str):
    """
    Returns the single most recent reading per sensor type for a specific device.
    Uses DISTINCT ON (sensor_type) with ORDER BY measured_at DESC so only the
    latest value for each sensor type (temperature, humidity, etc.) is returned,
    not the full history.

    Used by the frontend to show the current live status card for a device.

    Path params:
        device_id: The hardware identifier of the device to query, e.g. "esp32_node_01"
    """
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT DISTINCT ON (sensor_type) "
            "id, device_id, sensor_id, sensor_type, value, unit, measured_at, seq "
            "FROM iot_sensor_readings "
            "WHERE device_id=$1 "
            "ORDER BY sensor_type, measured_at DESC",  # DISTINCT ON requires ORDER BY to start with the same column
            device_id,
        )
        data = []
        for r in rows:
            d = dict(r)
            d["measured_at"] = str(d["measured_at"])  # Convert datetime to ISO string for JSON
            data.append(d)
        return {"ok": True, "count": len(data), "data": data}

    except Exception as e:
        raise HTTPException(500, str(e))