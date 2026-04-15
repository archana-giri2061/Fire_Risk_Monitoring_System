from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from database import get_pool
from config import cfg
from email_helpers import (
    RISK_RANK, RISK_ICON, RISK_COLOR,
    send_raw_email, build_alert_html, build_alert_text,
)

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


async def _log_alert(location_key, risk_label, alert_date, message):
    try:
        pool = await get_pool()
        await pool.execute(
            "INSERT INTO alert_logs (location_key,risk_label,alert_date,message,created_at) "
            "VALUES ($1,$2,$3::date,$4,NOW()) ON CONFLICT DO NOTHING",
            location_key, risk_label, alert_date, message,
        )
    except Exception:
        pass


async def run_risk_email_alerts(
    latitude=None, longitude=None, location_key=None,
    min_risk="High", extra_to=None, iot_note=None,
):
    lat = latitude     or cfg.latitude
    lon = longitude    or cfg.longitude
    loc = location_key or cfg.location_key
    threshold_rank = RISK_RANK.get(min_risk, 2)

    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT date,risk_label,COALESCE(risk_probability,0) AS risk_probability "
        "FROM fire_risk_predictions "
        "WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE "
        "ORDER BY date ASC LIMIT 7",
        lat, lon,
    )

    high_days = [
        {
            "date":             str(r["date"])[:10],
            "risk_label":       r["risk_label"],
            "risk_probability": float(r["risk_probability"]),
        }
        for r in rows
        if RISK_RANK.get(r["risk_label"], -1) >= threshold_rank
    ]

    if not high_days:
        return {"ok": True, "sent": False, "alerts": 0,
                "message": "No " + min_risk + "+ risk days in forecast"}

    worst           = max(high_days, key=lambda d: RISK_RANK.get(d["risk_label"], 0))
    threshold_label = worst["risk_label"]
    icon            = RISK_ICON.get(threshold_label, "🔴")
    subject         = icon + " " + threshold_label + " Fire Risk Alert — " + loc
    html            = build_alert_html(loc, lat, lon, threshold_label, high_days)
    text            = build_alert_text(loc, lat, lon, threshold_label, high_days)
    if iot_note:
        text += "\n\n⚠ IoT Note: " + iot_note

    try:
        result = send_raw_email(subject, text, html)
    except Exception as e:
        return {"ok": False, "sent": False, "message": str(e)}

    for d in high_days:
        await _log_alert(loc, d["risk_label"], d["date"],
                         "Auto-alert: " + d["risk_label"] + " risk on " + d["date"])

    return {"ok": True, "sent": True, "alerts": len(high_days),
            "recipients": [cfg.smtp_to], "days": high_days,
            "message": "Alert sent for " + str(len(high_days)) + " " + min_risk + "+ day(s)"}


async def _send_daily_report():
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT date,risk_label,COALESCE(risk_probability,0) AS risk_probability "
        "FROM fire_risk_predictions "
        "WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE "
        "ORDER BY date ASC LIMIT 7",
        cfg.latitude, cfg.longitude,
    )
    if not rows:
        return {"ok": True, "sent": False, "message": "No predictions in DB"}

    predictions = [
        {"date": str(r["date"])[:10], "risk_label": r["risk_label"],
         "risk_probability": float(r["risk_probability"])}
        for r in rows
    ]
    worst = max(predictions, key=lambda d: RISK_RANK.get(d["risk_label"], 0))
    icon  = RISK_ICON.get(worst["risk_label"], "🟢")
    color = RISK_COLOR.get(worst["risk_label"], "#9DC88D")

    rows_html = ""
    for d in predictions:
        rl     = d["risk_label"]
        prob   = str(round(float(d["risk_probability"]) * 100, 1)) + "%"
        dcolor = RISK_COLOR.get(rl, "#fff")
        dicon  = RISK_ICON.get(rl, "")
        rows_html += (
            "<tr>"
            "<td style='padding:8px;border-bottom:1px solid #333'>" + d["date"] + "</td>"
            "<td style='padding:8px;border-bottom:1px solid #333;color:" + dcolor + "'>" + dicon + " " + rl + "</td>"
            "<td style='padding:8px;border-bottom:1px solid #333'>" + prob + "</td>"
            "</tr>"
        )

    html = (
        "<html><body style='font-family:sans-serif;background:#1a1a1a;color:#fff;padding:20px'>"
        "<div style='max-width:600px;margin:auto;background:#242424;border-radius:16px;overflow:hidden'>"
        "<div style='background:" + color + ";padding:24px;text-align:center'>"
        "<div style='font-size:36px'>" + icon + "</div>"
        "<h2 style='margin:8px 0 0;color:#fff'>Daily Fire Risk Report</h2>"
        "<p style='color:rgba(255,255,255,0.8);margin:4px 0 0'>" + cfg.location_key + "</p>"
        "</div><div style='padding:24px'>"
        "<table style='width:100%;border-collapse:collapse'>"
        "<tr style='background:#333'>"
        "<th style='padding:10px;text-align:left'>Date</th>"
        "<th style='padding:10px;text-align:left'>Risk Level</th>"
        "<th style='padding:10px;text-align:left'>Confidence</th>"
        "</tr>" + rows_html + "</table>"
        "<p style='margin-top:20px;color:#aaa;font-size:12px'>वन दृष्टि — Forest Fire Risk Monitoring System</p>"
        "</div></div></body></html>"
    )

    text_lines = ["Daily Fire Risk Report — " + cfg.location_key]
    for d in predictions:
        prob = str(round(float(d["risk_probability"]) * 100, 1)) + "%"
        text_lines.append("  " + d["date"] + " | " + d["risk_label"] + " | " + prob)
    text = "\n".join(text_lines)

    try:
        result = send_raw_email(icon + " Daily Fire Risk Report — " + cfg.location_key, text, html)
        return {"ok": True, "sent": True, "riskLevel": worst["risk_label"],
                "predictions": len(predictions), **result}
    except Exception as e:
        return {"ok": False, "sent": False, "message": str(e)}


# ── Request models ─────────────────────────────────────────────────────────

class RunEmailBody(BaseModel):
    minRisk: Optional[str]       = "High"
    extraTo: Optional[List[str]] = []
    note:    Optional[str]       = None


class IoTFireBody(BaseModel):
    deviceId:     Optional[str]   = "unknown"
    deviceName:   Optional[str]   = "IoT Sensor"
    location:     Optional[str]   = None
    smokePpm:     Optional[float] = 0
    temperature:  Optional[float] = 0
    fireDetected: Optional[bool]  = False


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/run-email")
async def alerts_run_email(body: RunEmailBody = RunEmailBody()):
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
    try:
        return await run_risk_email_alerts(min_risk="Extreme")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/daily-report")
async def alerts_daily_report():
    try:
        return await _send_daily_report()
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/status")
async def alerts_status():
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT date,risk_code,risk_label,"
            "COALESCE(risk_probability,0) AS risk_probability,model_name,created_at "
            "FROM fire_risk_predictions "
            "WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE "
            "ORDER BY date ASC LIMIT 7",
            cfg.latitude, cfg.longitude,
        )
        preds = [
            {"date": str(r["date"])[:10], "risk_code": r["risk_code"],
             "risk_label": r["risk_label"],
             "risk_probability": str(round(float(r["risk_probability"]), 3)),
             "model_name": r["model_name"]}
            for r in rows
        ]
        high = [p for p in preds if p["risk_label"] in ("High", "Extreme")]
        return {"ok": True, "location": cfg.location_key, "total": len(preds),
                "highRiskDays": len(high), "alertNeeded": len(high) > 0, "predictions": preds}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/history")
async def alerts_history(limit: int = Query(20, le=100)):
    try:
        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT id,location_key,risk_label,alert_date,message,created_at "
            "FROM alert_logs ORDER BY created_at DESC LIMIT $1",
            limit,
        )
        data = [dict(r) | {"alert_date": str(r["alert_date"])[:10]} for r in rows]
        return {"ok": True, "count": len(data), "data": data}
    except Exception as e:
        if "does not exist" in str(e):
            return {"ok": True, "count": 0, "data": [], "note": "alert_logs table not found"}
        raise HTTPException(500, str(e))


@router.post("/test-email")
async def alerts_test_email():
    try:
        body = (
            "This is a test email from your Wildfire Risk Monitoring System.\n\n"
            "If you received this, your SMTP configuration is working correctly.\n\n"
            "Location : " + cfg.location_key + "\n"
            "Coords   : lat=" + str(cfg.latitude) + ", lon=" + str(cfg.longitude) + "\n"
            "SMTP Host: " + cfg.smtp_host + "\n\n"
            "वन दृष्टि — Wildfire Risk Monitoring System"
        )
        send_raw_email("🧪 Test Email — Wildfire Alert System", body)
        return {"ok": True, "message": "Test email sent successfully.", "to": cfg.smtp_to}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/test-extreme")
async def alerts_test_extreme():
    try:
        today = str(date.today())
        tmrw  = str(date.today() + timedelta(days=1))
        mock  = [
            {"date": today, "risk_label": "Extreme", "risk_probability": 0.94},
            {"date": tmrw,  "risk_label": "Extreme", "risk_probability": 0.88},
        ]
        subject = "🔴 [TEST] EXTREME Fire Risk Alert — " + cfg.location_key
        html    = build_alert_html(cfg.location_key, cfg.latitude, cfg.longitude, "Extreme", mock)
        text    = build_alert_text(cfg.location_key, cfg.latitude, cfg.longitude, "Extreme", mock)
        result  = send_raw_email(subject, text, html)
        return {"ok": True, "message": "Test EXTREME alert email sent.", **result}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/test-daily-report")
async def alerts_test_daily_report():
    try:
        result = await _send_daily_report()
        return {"ok": True, "message": "Test daily report sent.", **result}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/iot-fire")
async def alerts_iot_fire(body: IoTFireBody):
    try:
        loc     = body.location or cfg.location_key
        icon    = "🔥" if body.fireDetected else "💨"
        subject = icon + " IoT " + ("Fire" if body.fireDetected else "Smoke") + " Alert — " + str(body.deviceName)
        text    = (
            "Device   : " + str(body.deviceName) + " (" + str(body.deviceId) + ")\n"
            "Location : " + loc + "\n"
            "Smoke    : " + str(body.smokePpm) + " ppm\n"
            "Temp     : " + str(body.temperature) + "°C\n"
            "Fire     : " + ("DETECTED 🔥" if body.fireDetected else "Not detected")
        )
        result = send_raw_email(subject, text)
        return {"ok": True, "sent": True, "recipients": [cfg.smtp_to], **result}
    except Exception as e:
        raise HTTPException(500, str(e))