# dashboard.py
# Provides the /api/dashboard/home endpoint.
# Combines weather archive data and live IoT sensor readings
# into a single response for the frontend home dashboard.

from fastapi import APIRouter, HTTPException
from database import get_pool
from config import cfg

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


# Utility helpers 

def _to_num(v, fallback: float = 0.0) -> float:
    # Safely convert any value to float.
    # Returns fallback if conversion fails or if the result is NaN.
    # (NaN check: a float is NaN only when it does not equal itself)
    try:
        n = float(v)
        return n if n == n else fallback
    except Exception:
        return fallback


def _get_condition(temp: float, humidity: float, wind: float, rain: float) -> str:
    # Determine the current fire risk condition based on weather thresholds.
    # Rules are checked in priority order — most severe first.

    # All three danger factors present at once — highest concern
    if temp >= 32 and humidity <= 40 and wind >= 18:
        return "Critical Watch"

    # Low moisture with little rain — fire can spread easily
    if humidity <= 45 and rain <= 1:
        return "Dry Conditions"

    # Strong wind alone increases fire spread risk
    if wind >= 20:
        return "Wind Alert"

    # Nothing concerning — normal state
    return "Stable"


def _get_action(condition: str) -> str:
    # Returns the recommended response action for a given condition.
    # Falls back to routine monitoring if the condition is unrecognised.
    return {
        "Critical Watch": "Immediate monitoring required",
        "Dry Conditions":  "Monitor closely",
        "Wind Alert":      "Check windy zones",
    }.get(condition, "Routine monitoring")


def _get_severity(condition: str) -> str:
    # Maps a condition label to a severity tier used by the frontend alert UI.
    return {
        "Critical Watch": "High",
        "Dry Conditions":  "Medium",
        "Wind Alert":      "Medium",
    }.get(condition, "Low")


# Route

@router.get("/home")
async def dashboard_home():
    """
    Main dashboard data endpoint.
    Pulls the last 12 days of weather archive records, merges in the
    latest IoT sensor values where available, then returns overview
    stats, trend data, per-day readings, active alerts, and area info.
    """
    try:
        pool = await get_pool()

        # Fetch the 12 most recent archive weather rows for this location,
        # newest first (we reverse later for the trend chart)
        archive_rows = await pool.fetch(
            """
            SELECT date, location_key, latitude, longitude,
                   temp_mean, humidity_mean, wind_speed_max,
                   precipitation_sum, updated_at
            FROM daily_weather
            WHERE location_key = $1
              AND data_source  = 'archive'
            ORDER BY date DESC
            LIMIT 12
            """,
            cfg.location_key,
        )

        # No weather data at all — return a safe empty response
        # so the frontend can render a "no data" state cleanly
        if not archive_rows:
            return {
                "overview": {
                    "monitoringStatus": "No Data",
                    "lastUpdated":      "Not available",
                    "dataSource":       "Database",
                    "temperature":  0,
                    "humidity":     0,
                    "windSpeed":    0,
                    "rainfall":     0,
                    "pressure":     0,
                    "activeAlerts": 0,
                },
                "trends":   [],
                "readings": [],
                "alerts":   [],
                "areas":    [],
            }

        # Most recent weather row drives the overview card
        latest = archive_rows[0]

        # Trend chart needs chronological order (oldest -> newest)
        trend_rows = list(reversed(archive_rows))

        # Merge live IoT sensor readings
        # We attempt to read the latest value for each sensor type.
        # If the table doesn't exist yet (fresh install), we silently skip
        # and fall back to the weather archive values below.
        sensor_map: dict = {}
        try:
            sensor_rows = await pool.fetch(
                """
                SELECT DISTINCT ON (sensor_type)
                    sensor_type, value, measured_at
                FROM iot_sensor_readings
                ORDER BY sensor_type, measured_at DESC
                """
            )
            # Index by lowercase sensor_type for consistent key lookups
            for s in sensor_rows:
                sensor_map[str(s["sensor_type"]).lower()] = _to_num(s["value"])
        except Exception:
            # Table missing or unreadable — continue with archive-only data
            pass

        # Prefer live sensor values; fall back to weather archive if not available
        temperature = (
            sensor_map.get("temperature")
            or _to_num(latest["temp_mean"])
        )
        humidity = (
            sensor_map.get("humidity")
            or _to_num(latest["humidity_mean"])
        )
        wind_speed = (
            sensor_map.get("wind")
            or sensor_map.get("wind_speed")
            or _to_num(latest["wind_speed_max"])
        )
        rainfall = (
            sensor_map.get("rainfall")
            or sensor_map.get("precipitation")
            or _to_num(latest["precipitation_sum"])
        )

        # Build per-day readings list 
        # Each entry represents one day in the readings table on the dashboard.
        # Condition is recalculated per row using that day's specific values.
        readings = [
            {
                "time":        str(r["date"]),
                "location":    r["location_key"],
                "temperature": _to_num(r["temp_mean"]),
                "humidity":    _to_num(r["humidity_mean"]),
                "windSpeed":   _to_num(r["wind_speed_max"]),
                "rainfall":    _to_num(r["precipitation_sum"]),
                "pressure":    0,  # Not stored in DB; placeholder for future sensor
                "status": _get_condition(
                    _to_num(r["temp_mean"]),
                    _to_num(r["humidity_mean"]),
                    _to_num(r["wind_speed_max"]),
                    _to_num(r["precipitation_sum"]),
                ),
            }
            for r in archive_rows
        ]

        # Build trend chart data
        # Chronological subset of readings used for line charts on the frontend.
        trends = [
            {
                "time":        str(r["date"]),
                "temperature": _to_num(r["temp_mean"]),
                "humidity":    _to_num(r["humidity_mean"]),
                "windSpeed":   _to_num(r["wind_speed_max"]),
            }
            for r in trend_rows
        ]

        # Determine current condition for the monitored area
        condition = _get_condition(temperature, humidity, wind_speed, rainfall)

        areas = [
            {
                "area":           cfg.location_key,
                "avgTemperature": temperature,
                "avgHumidity":    humidity,
                "avgWindSpeed":   wind_speed,
                "condition":      condition,
                "action":         _get_action(condition),
                # Use DB-stored coords; fall back to config if column is null
                "lat": _to_num(latest["latitude"],  cfg.latitude),
                "lng": _to_num(latest["longitude"], cfg.longitude),
            }
        ]

        # Build alert list 
        # Only non-Stable conditions produce an alert entry.
        # The frontend uses this list to render the alerts panel.
        alert_messages = {
            "Critical Watch": (
                "High temperature, low humidity, and strong wind "
                "require urgent monitoring."
            ),
            "Dry Conditions": (
                "Dry environmental conditions detected "
                "in the monitored area."
            ),
            "Wind Alert": (
                "Strong wind conditions detected "
                "in the monitored area."
            ),
        }

        alerts = [] if condition == "Stable" else [
            {
                "time":     str(latest["date"]),
                "type":     condition,
                "location": cfg.location_key,
                "severity": _get_severity(condition),
                "message":  alert_messages.get(condition, ""),
            }
        ]

        # Assemble and return the full dashboard payload 
        return {
            "overview": {
                "monitoringStatus": "Active",
                # Prefer the DB updated_at timestamp; fall back to the date column
                "lastUpdated": (
                    str(latest["updated_at"])
                    if latest["updated_at"]
                    else str(latest["date"])
                ),
                # Tell the frontend whether live sensor data was merged in
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