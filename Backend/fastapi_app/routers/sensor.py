from typing import List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from database import get_pool

router = APIRouter(prefix="/api/sensor", tags=["Sensor"])


class SensorReading(BaseModel):
    sensor_id:   str
    sensor_type: str
    value:       float
    unit:        str


class SensorIngestBody(BaseModel):
    device_id:   str
    seq:         int
    measured_at: datetime        # Pydantic auto-parses "2026-04-04T10:30:00" -> datetime
    readings:    List[SensorReading]


@router.get("/ingest")
async def sensor_ingest_info():
    return {"ok": True, "message": "Use POST /api/sensor/ingest"}


@router.post("/ingest")
async def sensor_ingest(body: SensorIngestBody):
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            for r in body.readings:
                await conn.execute(
                    "INSERT INTO iot_sensor_readings "
                    "(device_id,sensor_id,sensor_type,value,unit,measured_at,seq) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7) "
                    "ON CONFLICT (device_id,sensor_id,seq) "
                    "DO UPDATE SET value=$4,unit=$5,measured_at=$6",
                    body.device_id, r.sensor_id, r.sensor_type,
                    r.value, r.unit, body.measured_at, body.seq
                )
        return {"ok": True, "inserted": len(body.readings)}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/devices")
async def sensor_devices():
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT DISTINCT device_id FROM iot_sensor_readings ORDER BY device_id ASC"
        )
        return {"ok": True, "count": len(rows), "data": [r["device_id"] for r in rows]}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/all")
async def sensor_all(limit: int = Query(100)):
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT id,device_id,sensor_id,sensor_type,value,unit,measured_at,seq "
            "FROM iot_sensor_readings ORDER BY measured_at DESC LIMIT $1",
            limit,
        )
        data = []
        for r in rows:
            d = dict(r)
            d["measured_at"] = str(d["measured_at"])
            data.append(d)
        return {"ok": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/latest/{device_id}")
async def sensor_latest(device_id: str):
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT DISTINCT ON (sensor_type) "
            "id,device_id,sensor_id,sensor_type,value,unit,measured_at,seq "
            "FROM iot_sensor_readings WHERE device_id=$1 "
            "ORDER BY sensor_type,measured_at DESC",
            device_id,
        )
        data = []
        for r in rows:
            d = dict(r)
            d["measured_at"] = str(d["measured_at"])
            data.append(d)
        return {"ok": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(500, str(e))