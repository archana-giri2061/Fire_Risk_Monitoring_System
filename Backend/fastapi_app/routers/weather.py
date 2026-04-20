# weather.py
# FastAPI router for weather data synchronisation and retrieval.
# Fetches historical archive and forecast data from the Open-Meteo API
# and stores it in the database for use by the ML pipeline and frontend.
# All routes are prefixed with /api/weather.

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query
from database import get_pool  # Returns the active asyncpg connection pool
from config import cfg          # Application configuration loaded from .env

router = APIRouter(prefix="/api/weather", tags=["Weather"])


@router.get("/db-test")
async def db_test():
    """
    Simple liveness check that verifies the database connection is working.
    Runs a minimal query (SELECT NOW()) and returns the server timestamp.
    Useful for debugging connectivity issues on the EC2 instance.
    """
    try:
        pool = await get_pool()
        row = await pool.fetchrow("SELECT NOW() AS now")
        return {"ok": True, "data": {"now": str(row["now"])}}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/sync-all")
async def sync_all():
    """
    Fetches weather data from the Open-Meteo API and upserts it into the database.
    Runs two separate API calls in sequence:
      1. Archive API  — historical daily data going back cfg.archive_days (default 60)
      2. Forecast API — upcoming daily data for cfg.forecast_days ahead (default 7)

    Archive rows go into the daily_weather table with data_source='archive'.
    Forecast rows go into the daily_weather_forecast table.

    Both use ON CONFLICT DO UPDATE (upsert) so re-running sync never creates duplicates.
    Days where temp_max is null are skipped as incomplete records from the API.
    If temp_mean is missing but temp_max and temp_min are present, it is derived
    as their average rather than leaving it null.
    """
    try:
        import httpx  # Imported here to keep startup fast; only needed when this route is called

        today = date.today()
        start = today - timedelta(days=cfg.archive_days)  # Earliest date to fetch archive data for

        # Shared query parameters used for both the archive and forecast API calls
        params = {
            "latitude":  cfg.latitude,
            "longitude": cfg.longitude,
            "timezone":  "Asia/Kathmandu",
            "daily": (
                "temperature_2m_max,temperature_2m_min,temperature_2m_mean,"
                "relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max"
            ),
        }

        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch historical archive data for the past cfg.archive_days days
            arch = (await client.get(
                "https://archive-api.open-meteo.com/v1/archive",
                params={**params, "start_date": str(start), "end_date": str(today)},
            )).json()

            # Fetch the upcoming forecast data
            fore = (await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={**params, "forecast_days": cfg.forecast_days},
            )).json()

        # Both API responses return a "daily" dict with parallel arrays keyed by field name
        arch_daily = arch.get("daily", {})
        fore_daily = fore.get("daily", {})

        arch_rows = fore_rows = 0  # Counters for the response summary

        pool = await get_pool()

        # Use a single acquired connection for all inserts to avoid pool overhead
        async with pool.acquire() as conn:

            # Process each day in the archive response
            for i, d in enumerate(arch_daily.get("time", [])):
                tmax  = arch_daily.get("temperature_2m_max",       [None])[i]
                tmin  = arch_daily.get("temperature_2m_min",        [None])[i]
                tmean = arch_daily.get("temperature_2m_mean",       [None])[i]
                hum   = arch_daily.get("relative_humidity_2m_mean", [None])[i]
                prec  = arch_daily.get("precipitation_sum",         [None])[i]
                wind  = arch_daily.get("wind_speed_10m_max",        [None])[i]

                # Skip days where the primary temperature field is missing
                if tmax is None:
                    continue

                # Derive mean temperature from max/min if the API did not return it directly
                if tmean is None and tmax is not None and tmin is not None:
                    tmean = (tmax + tmin) / 2

                await conn.execute("""
                    INSERT INTO daily_weather
                    (date, location_key, latitude, longitude, temp_max, temp_min,
                     temp_mean, humidity_mean, precipitation_sum, wind_speed_max,
                     data_source, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'archive', NOW())
                    ON CONFLICT (date, location_key, data_source)
                    DO UPDATE SET
                        temp_max=$5, temp_min=$6, temp_mean=$7,
                        humidity_mean=$8, precipitation_sum=$9,
                        wind_speed_max=$10, updated_at=NOW()
                """,
                    d,                  # $1  — date string from API e.g. "2026-04-01"
                    cfg.location_key,   # $2  — location label e.g. "lumbini_28.002_83.036"
                    cfg.latitude,       # $3
                    cfg.longitude,      # $4
                    tmax,               # $5  — daily maximum temperature in Celsius
                    tmin,               # $6  — daily minimum temperature in Celsius
                    tmean,              # $7  — daily mean temperature (derived if absent)
                    hum,                # $8  — mean relative humidity percentage
                    prec or 0,          # $9  — total precipitation in mm (null -> 0)
                    wind or 0,          # $10 — max wind speed in km/h (null -> 0)
                )
                arch_rows += 1

            # Process each day in the forecast response
            for i, d in enumerate(fore_daily.get("time", [])):
                tmax  = fore_daily.get("temperature_2m_max",       [None])[i]
                tmin  = fore_daily.get("temperature_2m_min",        [None])[i]
                tmean = fore_daily.get("temperature_2m_mean",       [None])[i]
                hum   = fore_daily.get("relative_humidity_2m_mean", [None])[i]
                prec  = fore_daily.get("precipitation_sum",         [None])[i]
                wind  = fore_daily.get("wind_speed_10m_max",        [None])[i]

                # Skip days where the primary temperature field is missing
                if tmax is None:
                    continue

                # Derive mean temperature from max/min if the API did not return it directly
                if tmean is None and tmax is not None and tmin is not None:
                    tmean = (tmax + tmin) / 2

                await conn.execute("""
                    INSERT INTO daily_weather_forecast
                    (date, latitude, longitude, temp_max, temp_min, temp_mean,
                     humidity_mean, precipitation_sum, wind_speed_max, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                    ON CONFLICT (date, latitude, longitude)
                    DO UPDATE SET
                        temp_max=$4, temp_min=$5, temp_mean=$6,
                        humidity_mean=$7, precipitation_sum=$8,
                        wind_speed_max=$9, updated_at=NOW()
                """,
                    d,             # $1  — forecast date string
                    cfg.latitude,  # $2
                    cfg.longitude, # $3
                    tmax,          # $4
                    tmin,          # $5
                    tmean,         # $6
                    hum,           # $7
                    prec or 0,     # $8  — null -> 0 for days with no precipitation forecast
                    wind or 0,     # $9  — null -> 0 for calm days
                )
                fore_rows += 1

        return {
            "ok":      True,
            "message": f"Sync complete — archive: {arch_rows} rows, forecast: {fore_rows} rows",
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/archive")
async def get_archive(limit: int = Query(60, le=365)):
    """
    Returns stored historical weather records for the configured location,
    ordered newest first. Used by the frontend weather charts and the ML
    training pipeline to access recent climate data.

    Query params:
        limit: Number of days to return (default 60, max 365)
    """
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            """SELECT date, location_key, latitude, longitude, temp_max, temp_min,
                      temp_mean, humidity_mean, precipitation_sum, wind_speed_max,
                      data_source, updated_at
               FROM daily_weather
               WHERE location_key=$1 AND data_source='archive'
               ORDER BY date DESC LIMIT $2""",
            cfg.location_key,
            limit,
        )
        # Merge each row dict with a plain date string (asyncpg returns date objects)
        data = [dict(r) | {"date": str(r["date"])[:10]} for r in rows]
        return {"ok": True, "count": len(data), "location": cfg.location_key, "data": data}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/forecast")
async def get_forecast():
    """
    Returns all stored forecast rows for the configured coordinates, ordered
    by date ascending so the frontend can render a day-by-day forward view.
    Populated by POST /api/weather/sync-all.
    """
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            """SELECT date, latitude, longitude, temp_max, temp_min, temp_mean,
                      humidity_mean, precipitation_sum, wind_speed_max, updated_at
               FROM daily_weather_forecast
               WHERE latitude=$1 AND longitude=$2
               ORDER BY date ASC""",
            cfg.latitude,
            cfg.longitude,
        )
        data = [dict(r) | {"date": str(r["date"])[:10]} for r in rows]
        return {"ok": True, "count": len(data), "location": cfg.location_key, "data": data}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/summary")
async def get_summary():
    """
    Returns aggregated statistics across all stored archive records for the
    configured location. Used by the frontend dashboard summary cards.

    Computed fields:
        total_days      — number of days with archive data
        avg_temp        — mean of daily mean temperatures
        max_temp        — highest daily maximum recorded
        min_temp        — lowest daily minimum recorded
        avg_humidity    — mean of daily humidity percentages
        total_rainfall  — sum of all daily precipitation in mm
        from_date       — earliest date in the archive
        to_date         — most recent date in the archive
    """
    try:
        pool = await get_pool()
        row = await pool.fetchrow(
            """SELECT COUNT(*) AS total_days,
                      ROUND(AVG(temp_mean)::numeric, 2)         AS avg_temp,
                      ROUND(MAX(temp_max)::numeric, 2)          AS max_temp,
                      ROUND(MIN(temp_min)::numeric, 2)          AS min_temp,
                      ROUND(AVG(humidity_mean)::numeric, 2)     AS avg_humidity,
                      ROUND(SUM(precipitation_sum)::numeric, 2) AS total_rainfall_mm,
                      MIN(date) AS from_date,
                      MAX(date) AS to_date
               FROM daily_weather
               WHERE location_key=$1 AND data_source='archive'""",
            cfg.location_key,
        )
        s = dict(row)

        # Convert date objects to plain strings; guard against null if table is empty
        s["from_date"] = str(s["from_date"])[:10] if s["from_date"] else None
        s["to_date"]   = str(s["to_date"])[:10]   if s["to_date"]   else None

        return {"ok": True, "location": cfg.location_key, "summary": s}
    except Exception as e:
        raise HTTPException(500, str(e))