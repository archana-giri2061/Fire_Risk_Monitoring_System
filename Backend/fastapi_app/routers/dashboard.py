from fastapi import APIRouter, HTTPException
from database import get_pool
from config import cfg

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _to_num(v, fallback: float = 0.0) -> float:
    try:
        n = float(v)
        return n if n == n else fallback
    except Exception:
        return fallback


def _get_condition(temp: float, humidity: float, wind: float, rain: float) -> str:
    if temp >= 32 and humidity <= 40 and wind >= 18:
        return "Critical Watch"
    if humidity <= 45 and rain <= 1:
        return "Dry Conditions"
    if wind >= 20:
        return "Wind Alert"
    return "Stable"


def _get_action(condition: str) -> str:
    return {
        "Critical Watch": "Immediate monitoring required",
        "Dry Conditions":  "Monitor closely",
        "Wind Alert":      "Check windy zones",
    }.get(condition, "Routine monitoring")


def _get_severity(condition: str) -> str:
    return {
        "Critical Watch": "High",
        "Dry Conditions":  "Medium",
        "Wind Alert":      "Medium",
    }.get(condition, "Low")


@router.get("/home")
async def dashboard_home():
    try:
        pool = await get_pool()

        archive_rows = await pool.fetch(
            """SELECT date,location_key,latitude,longitude,
                      temp_mean,humidity_mean,wind_speed_max,
                      precipitation_sum,updated_at
               FROM daily_weather
               WHERE location_key=$1 AND data_source='archive'
               ORDER BY date DESC LIMIT 12""",
            cfg.location_key,
        )

        if not archive_rows:
            return {
                "overview": {
                    "monitoringStatus": "No Data",
                    "lastUpdated":      "Not available",
                    "dataSource":       "Database",
                    "temperature": 0, "humidity": 0,
                    "windSpeed": 0,   "rainfall": 0,
                    "pressure": 0,    "activeAlerts": 0,
                },
                "trends": [], "readings": [], "alerts": [], "areas": [],
            }

        latest    = archive_rows[0]
        trend_rows = list(reversed(archive_rows))

        # Try latest sensor readings
        sensor_map: dict = {}
        try:
            sensor_rows = await pool.fetch(
                """SELECT DISTINCT ON (sensor_type) sensor_type,value,measured_at
                   FROM iot_sensor_readings
                   ORDER BY sensor_type,measured_at DESC"""
            )
            for s in sensor_rows:
                sensor_map[str(s["sensor_type"]).lower()] = _to_num(s["value"])
        except Exception:
            pass

        temperature = sensor_map.get("temperature") or _to_num(latest["temp_mean"])
        humidity    = sensor_map.get("humidity")    or _to_num(latest["humidity_mean"])
        wind_speed  = (sensor_map.get("wind") or sensor_map.get("wind_speed")
                       or _to_num(latest["wind_speed_max"]))
        rainfall    = (sensor_map.get("rainfall") or sensor_map.get("precipitation")
                       or _to_num(latest["precipitation_sum"]))

        readings = [{
            "time":        str(r["date"]),
            "location":    r["location_key"],
            "temperature": _to_num(r["temp_mean"]),
            "humidity":    _to_num(r["humidity_mean"]),
            "windSpeed":   _to_num(r["wind_speed_max"]),
            "rainfall":    _to_num(r["precipitation_sum"]),
            "pressure":    0,
            "status":      _get_condition(
                _to_num(r["temp_mean"]), _to_num(r["humidity_mean"]),
                _to_num(r["wind_speed_max"]), _to_num(r["precipitation_sum"]),
            ),
        } for r in archive_rows]

        trends = [{
            "time":        str(r["date"]),
            "temperature": _to_num(r["temp_mean"]),
            "humidity":    _to_num(r["humidity_mean"]),
            "windSpeed":   _to_num(r["wind_speed_max"]),
        } for r in trend_rows]

        condition = _get_condition(temperature, humidity, wind_speed, rainfall)
        areas = [{
            "area":           cfg.location_key,
            "avgTemperature": temperature,
            "avgHumidity":    humidity,
            "avgWindSpeed":   wind_speed,
            "condition":      condition,
            "action":         _get_action(condition),
            "lat": _to_num(latest["latitude"],  cfg.latitude),
            "lng": _to_num(latest["longitude"], cfg.longitude),
        }]

        alert_messages = {
            "Critical Watch": "High temperature, low humidity, and strong wind require urgent monitoring.",
            "Dry Conditions":  "Dry environmental conditions detected in the monitored area.",
            "Wind Alert":      "Strong wind conditions detected in the monitored area.",
        }
        alerts = [] if condition == "Stable" else [{
            "time":     str(latest["date"]),
            "type":     condition,
            "location": cfg.location_key,
            "severity": _get_severity(condition),
            "message":  alert_messages.get(condition, ""),
        }]

        return {
            "overview": {
                "monitoringStatus": "Active",
                "lastUpdated":  (str(latest["updated_at"])
                                 if latest["updated_at"] else str(latest["date"])),
                "dataSource":   "Database + Sensor Readings" if sensor_map else "Database",
                "temperature":  temperature,
                "humidity":     humidity,
                "windSpeed":    wind_speed,
                "rainfall":     rainfall,
                "pressure":     0,
                "activeAlerts": len(alerts),
            },
            "trends":   trends,
            "readings": readings,
            "alerts":   alerts,
            "areas":    areas,
        }

    except Exception as e:
        raise HTTPException(500, str(e))