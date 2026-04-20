# alerts.py
# FastAPI router for fire risk alert management.
# Handles email alerts, daily reports, IoT sensor alerts, and alert history logging.

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# Internal modules
from database import get_pool          # Returns the active asyncpg connection pool
from config import cfg                 # Application configuration loaded from .env
from email_helpers import (
    RISK_RANK,        # Dict mapping risk label -> numeric rank, e.g. {"Low":0, "High":2, "Extreme":3}
    RISK_ICON,        # Dict mapping risk label -> display icon string
    RISK_COLOR,       # Dict mapping risk label -> hex color string for HTML emails
    send_raw_email,   # Sends a plain-text + HTML email via SMTP
    build_alert_html, # Builds the HTML body for a risk alert email
    build_alert_text, # Builds the plain-text body for a risk alert email
)

# All routes in this file are grouped under /api/alerts
router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


# Internal helper: log a sent alert to the database 

async def _log_alert(location_key, risk_label, alert_date, message):
    """
    Inserts a record into alert_logs to track that an alert was sent.
    Uses ON CONFLICT DO NOTHING to avoid duplicate log entries.
    Errors are silently swallowed so a logging failure never blocks an alert.
    """
    try:
        pool = await get_pool()
        await pool.execute(
            "INSERT INTO alert_logs (location_key, risk_label, alert_date, message, created_at) "
            "VALUES ($1, $2, $3::date, $4, NOW()) ON CONFLICT DO NOTHING",
            location_key,  # e.g. "lumbini_28.002_83.036"
            risk_label,    # e.g. "High" or "Extreme"
            alert_date,    # ISO date string, cast to DATE in SQL
            message,       # Human-readable description of the alert
        )
    except Exception:
        # Non-critical: logging failure should never prevent an alert from being sent
        pass


# Core alert logic: query predictions and send risk email 

async def run_risk_email_alerts(
    latitude=None,
    longitude=None,
    location_key=None,
    min_risk="High",
    extra_to=None,
    iot_note=None,
):
    """
    Fetches the next 7 days of fire risk predictions from the DB for the given
    coordinates, filters to days at or above min_risk, and sends an alert email
    if any qualifying days are found.

    Parameters:
        latitude     : Override latitude (defaults to cfg.latitude)
        longitude    : Override longitude (defaults to cfg.longitude)
        location_key : Override location label (defaults to cfg.location_key)
        min_risk     : Minimum risk level to trigger an alert, e.g. "High" or "Extreme"
        extra_to     : Additional recipient email addresses (not currently wired into send_raw_email)
        iot_note     : Optional note from an IoT device, appended to the plain-text email body
    """
    # Fall back to configured defaults if no overrides are provided
    lat = latitude     or cfg.latitude
    lon = longitude    or cfg.longitude
    loc = location_key or cfg.location_key

    # Convert the string risk level to a numeric rank for comparison
    threshold_rank = RISK_RANK.get(min_risk, 2)

    pool = await get_pool()

    # Query fire risk predictions for this location starting from today
    rows = await pool.fetch(
        "SELECT date, risk_label, COALESCE(risk_probability, 0) AS risk_probability "
        "FROM fire_risk_predictions "
        "WHERE latitude=$1 AND longitude=$2 AND date >= CURRENT_DATE "
        "ORDER BY date ASC LIMIT 7",
        lat,
        lon,
    )

    # Filter to only days that meet or exceed the minimum risk threshold
    high_days = [
        {
            "date":             str(r["date"])[:10],          # Format as YYYY-MM-DD
            "risk_label":       r["risk_label"],
            "risk_probability": float(r["risk_probability"]),
        }
        for r in rows
        if RISK_RANK.get(r["risk_label"], -1) >= threshold_rank
    ]

    # If no qualifying days exist, return early without sending an email
    if not high_days:
        return {
            "ok": True,
            "sent": False,
            "alerts": 0,
            "message": "No " + min_risk + "+ risk days in forecast",
        }

    # Identify the single worst day to use as the email subject/headline
    worst           = max(high_days, key=lambda d: RISK_RANK.get(d["risk_label"], 0))
    threshold_label = worst["risk_label"]
    icon            = RISK_ICON.get(threshold_label, "[!]")

    # Build email subject and body
    subject = icon + " " + threshold_label + " Fire Risk Alert — " + loc
    html    = build_alert_html(loc, lat, lon, threshold_label, high_days)
    text    = build_alert_text(loc, lat, lon, threshold_label, high_days)

    # Append IoT device note to plain-text body if provided
    if iot_note:
        text += "\n\nIoT Note: " + iot_note

    # Attempt to send the email; return error response on failure
    try:
        result = send_raw_email(subject, text, html)
    except Exception as e:
        return {"ok": False, "sent": False, "message": str(e)}

    # Log each high-risk day that triggered the alert
    for d in high_days:
        await _log_alert(
            loc,
            d["risk_label"],
            d["date"],
            "Auto-alert: " + d["risk_label"] + " risk on " + d["date"],
        )

    return {
        "ok":         True,
        "sent":       True,
        "alerts":     len(high_days),
        "recipients": [cfg.smtp_to],
        "days":       high_days,
        "message":    "Alert sent for " + str(len(high_days)) + " " + min_risk + "+ day(s)",
    }


# Internal helper: build and send the daily summary report 
async def _send_daily_report():
    """
    Fetches the next 7 days of predictions and sends a formatted daily summary
    email regardless of risk level. Used for scheduled daily reports.
    """
    pool = await get_pool()

    # Fetch upcoming predictions for the configured location
    rows = await pool.fetch(
        "SELECT date, risk_label, COALESCE(risk_probability, 0) AS risk_probability "
        "FROM fire_risk_predictions "
        "WHERE latitude=$1 AND longitude=$2 AND date >= CURRENT_DATE "
        "ORDER BY date ASC LIMIT 7",
        cfg.latitude,
        cfg.longitude,
    )

    # If no predictions are stored yet, return without sending
    if not rows:
        return {"ok": True, "sent": False, "message": "No predictions in DB"}

    # Normalize rows into plain dicts for easier processing
    predictions = [
        {
            "date":             str(r["date"])[:10],
            "risk_label":       r["risk_label"],
            "risk_probability": float(r["risk_probability"]),
        }
        for r in rows
    ]

    # Find the single worst predicted day to use as the report headline
    worst = max(predictions, key=lambda d: RISK_RANK.get(d["risk_label"], 0))
    icon  = RISK_ICON.get(worst["risk_label"], "[OK]")
    color = RISK_COLOR.get(worst["risk_label"], "#9DC88D")  # Fallback to green

    # Build the HTML table rows — one row per predicted day
    rows_html = ""
    for d in predictions:
        rl     = d["risk_label"]
        prob   = str(round(float(d["risk_probability"]) * 100, 1)) + "%"
        dcolor = RISK_COLOR.get(rl, "#fff")
        dicon  = RISK_ICON.get(rl, "")
        rows_html += (
            "<tr>"
            "<td style='padding:8px;border-bottom:1px solid #333'>" + d["date"] + "</td>"
            "<td style='padding:8px;border-bottom:1px solid #333;color:" + dcolor + "'>"
            + dicon + " " + rl + "</td>"
            "<td style='padding:8px;border-bottom:1px solid #333'>" + prob + "</td>"
            "</tr>"
        )

    # Assemble the full HTML email using inline styles for email client compatibility
    html = (
        "<html><body style='font-family:sans-serif;background:#1a1a1a;color:#fff;padding:20px'>"
        "<div style='max-width:600px;margin:auto;background:#242424;border-radius:16px;overflow:hidden'>"

        # Header banner with the worst risk color as background
        "<div style='background:" + color + ";padding:24px;text-align:center'>"
        "<div style='font-size:36px'>" + icon + "</div>"
        "<h2 style='margin:8px 0 0;color:#fff'>Daily Fire Risk Report</h2>"
        "<p style='color:rgba(255,255,255,0.8);margin:4px 0 0'>" + cfg.location_key + "</p>"
        "</div>"

        # Predictions table
        "<div style='padding:24px'>"
        "<table style='width:100%;border-collapse:collapse'>"
        "<tr style='background:#333'>"
        "<th style='padding:10px;text-align:left'>Date</th>"
        "<th style='padding:10px;text-align:left'>Risk Level</th>"
        "<th style='padding:10px;text-align:left'>Confidence</th>"
        "</tr>"
        + rows_html +
        "</table>"

        # Footer
        "<p style='margin-top:20px;color:#aaa;font-size:12px'>"
        "Van Drishti — Forest Fire Risk Monitoring System</p>"
        "</div></div></body></html>"
    )

    # Build a plain-text fallback version of the same report
    text_lines = ["Daily Fire Risk Report — " + cfg.location_key]
    for d in predictions:
        prob = str(round(float(d["risk_probability"]) * 100, 1)) + "%"
        text_lines.append("  " + d["date"] + " | " + d["risk_label"] + " | " + prob)
    text = "\n".join(text_lines)

    # Send the report email; return error response on failure
    try:
        result = send_raw_email(
            icon + " Daily Fire Risk Report — " + cfg.location_key,
            text,
            html,
        )
        return {
            "ok":          True,
            "sent":        True,
            "riskLevel":   worst["risk_label"],
            "predictions": len(predictions),
            **result,  # Merge any extra fields returned by send_raw_email (e.g. message ID)
        }
    except Exception as e:
        return {"ok": False, "sent": False, "message": str(e)}


#  Pydantic request body models

class RunEmailBody(BaseModel):
    """
    Request body for POST /api/alerts/run-email.
    All fields are optional and fall back to sensible defaults.
    """
    minRisk: Optional[str]       = "High"   # Minimum risk level to trigger alert
    extraTo: Optional[List[str]] = []        # Additional recipient addresses
    note:    Optional[str]       = None      # Free-text note to append to the email


class IoTFireBody(BaseModel):
    """
    Request body for POST /api/alerts/iot-fire.
    Sent by IoT devices when they detect smoke or fire conditions.
    """
    deviceId:     Optional[str]   = "unknown"  # Unique hardware identifier
    deviceName:   Optional[str]   = "IoT Sensor"
    location:     Optional[str]   = None        # Human-readable location label
    smokePpm:     Optional[float] = 0           # Smoke concentration in parts per million
    temperature:  Optional[float] = 0           # Ambient temperature in Celsius
    fireDetected: Optional[bool]  = False       # True if flame sensor triggered


# API route handlers 
@router.post("/run-email")
async def alerts_run_email(body: RunEmailBody = RunEmailBody()):
    """
    Manually trigger a risk email alert for the configured location.
    Filters predictions by minRisk level and sends if any qualifying days exist.
    """
    try:
        return await run_risk_email_alerts(
            min_risk=body.minRisk or "High",
            extra_to=body.extraTo or [],
            iot_note=body.note,
        )
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/run-extreme")
async def alerts_run_extreme():
    """
    Shortcut endpoint to trigger an alert only for Extreme risk days.
    Equivalent to calling /run-email with minRisk="Extreme".
    """
    try:
        return await run_risk_email_alerts(min_risk="Extreme")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/daily-report")
async def alerts_daily_report():
    """
    Sends the full 7-day daily summary report email regardless of risk level.
    Intended to be called by the scheduled daily report job.
    """
    try:
        return await _send_daily_report()
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/status")
async def alerts_status():
    """
    Returns the current 7-day fire risk forecast for the configured location.
    Also indicates whether any High or Extreme days were found (alertNeeded flag).
    """
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT date, risk_code, risk_label, "
            "COALESCE(risk_probability, 0) AS risk_probability, model_name, created_at "
            "FROM fire_risk_predictions "
            "WHERE latitude=$1 AND longitude=$2 AND date >= CURRENT_DATE "
            "ORDER BY date ASC LIMIT 7",
            cfg.latitude,
            cfg.longitude,
        )

        # Normalize rows to plain dicts; round probability to 3 decimal places
        preds = [
            {
                "date":             str(r["date"])[:10],
                "risk_code":        r["risk_code"],
                "risk_label":       r["risk_label"],
                "risk_probability": str(round(float(r["risk_probability"]), 3)),
                "model_name":       r["model_name"],
            }
            for r in rows
        ]

        # Identify days that require action (High or Extreme)
        high = [p for p in preds if p["risk_label"] in ("High", "Extreme")]

        return {
            "ok":          True,
            "location":    cfg.location_key,
            "total":       len(preds),
            "highRiskDays": len(high),
            "alertNeeded": len(high) > 0,  # Frontend uses this to show alert banner
            "predictions": preds,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/history")
async def alerts_history(limit: int = Query(20, le=100)):
    """
    Returns the most recent alert log entries, newest first.
    Gracefully handles the case where the alert_logs table does not yet exist.

    Query params:
        limit: Number of records to return (max 100, default 20)
    """
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT id, location_key, risk_label, alert_date, message, created_at "
            "FROM alert_logs ORDER BY created_at DESC LIMIT $1",
            limit,
        )
        # Merge the row dict with a formatted alert_date string (asyncpg returns date objects)
        data = [dict(r) | {"alert_date": str(r["alert_date"])[:10]} for r in rows]
        return {"ok": True, "count": len(data), "data": data}
    except Exception as e:
        # Table may not exist on first run — return empty list instead of 500
        if "does not exist" in str(e):
            return {"ok": True, "count": 0, "data": [], "note": "alert_logs table not found"}
        raise HTTPException(500, str(e))


@router.post("/test-email")
async def alerts_test_email():
    """
    Sends a plain diagnostic email to verify SMTP configuration is working.
    Does not require any predictions to be in the database.
    """
    try:
        body = (
            "This is a test email from your Wildfire Risk Monitoring System.\n\n"
            "If you received this, your SMTP configuration is working correctly.\n\n"
            "Location : " + cfg.location_key + "\n"
            "Coords   : lat=" + str(cfg.latitude) + ", lon=" + str(cfg.longitude) + "\n"
            "SMTP Host: " + cfg.smtp_host + "\n\n"
            "Van Drishti — Wildfire Risk Monitoring System"
        )
        send_raw_email("Test Email — Wildfire Alert System", body)
        return {"ok": True, "message": "Test email sent successfully.", "to": cfg.smtp_to}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/test-extreme")
async def alerts_test_extreme():
    """
    Sends a mock Extreme risk alert email using hardcoded test data.
    Useful for verifying the alert email template without needing real predictions.
    Today and tomorrow are used as the mock high-risk dates.
    """
    try:
        today = str(date.today())
        tmrw  = str(date.today() + timedelta(days=1))

        # Mock prediction data — not sourced from the database
        mock = [
            {"date": today, "risk_label": "Extreme", "risk_probability": 0.94},
            {"date": tmrw,  "risk_label": "Extreme", "risk_probability": 0.88},
        ]

        subject = "[TEST] EXTREME Fire Risk Alert — " + cfg.location_key
        html    = build_alert_html(cfg.location_key, cfg.latitude, cfg.longitude, "Extreme", mock)
        text    = build_alert_text(cfg.location_key, cfg.latitude, cfg.longitude, "Extreme", mock)
        result  = send_raw_email(subject, text, html)

        return {"ok": True, "message": "Test EXTREME alert email sent.", **result}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/test-daily-report")
async def alerts_test_daily_report():
    """
    Triggers the same daily report function used by the scheduler.
    Useful for manually verifying the daily report email format and delivery.
    Requires real predictions to exist in the database.
    """
    try:
        result = await _send_daily_report()
        return {"ok": True, "message": "Test daily report sent.", **result}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/iot-fire")
async def alerts_iot_fire(body: IoTFireBody):
    """
    Receives a fire or smoke detection event from an IoT device and sends
    an immediate email alert. This route is called directly by the ESP32/Arduino
    firmware when its local sensors cross a threshold.

    The email subject and body vary depending on whether full fire was detected
    vs. elevated smoke levels only.
    """
    try:
        # Use device-reported location if provided, otherwise fall back to system default
        loc = body.location or cfg.location_key

        # Choose subject prefix based on whether the flame sensor actually triggered
        alert_type = "Fire" if body.fireDetected else "Smoke"
        subject = (
            "IoT " + alert_type + " Alert — " + str(body.deviceName)
        )

        # Plain-text body with all sensor readings for easy reading in any email client
        text = (
            "Device   : " + str(body.deviceName) + " (" + str(body.deviceId) + ")\n"
            "Location : " + loc + "\n"
            "Smoke    : " + str(body.smokePpm) + " ppm\n"
            "Temp     : " + str(body.temperature) + " C\n"
            "Fire     : " + ("DETECTED" if body.fireDetected else "Not detected")
        )

        result = send_raw_email(subject, text)
        return {"ok": True, "sent": True, "recipients": [cfg.smtp_to], **result}
    except Exception as e:
        raise HTTPException(500, str(e))