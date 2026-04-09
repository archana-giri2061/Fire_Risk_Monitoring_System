import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from config import cfg

RISK_RANK  = {"Low": 0, "Moderate": 1, "High": 2, "Extreme": 3}
RISK_ICON  = {"Low": "🟢", "Moderate": "🟡", "High": "🟠", "Extreme": "🔴"}
RISK_COLOR = {"Low": "#9DC88D", "Moderate": "#F1B24A", "High": "#ff8c42", "Extreme": "#ff4d4d"}


def send_raw_email(subject: str, body_text: str, body_html: str = "") -> dict:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = cfg.smtp_from or cfg.smtp_user
    msg["To"]      = cfg.smtp_to
    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port) as s:
        s.starttls()
        s.login(cfg.smtp_user, cfg.smtp_pass)
        s.send_message(msg)
    return {"messageId": "<msg@fastapi>", "recipients": [cfg.smtp_to]}


def build_alert_html(location: str, lat: float, lon: float,
                     threshold: str, high_days: list) -> str:
    rows = ""
    for d in high_days:
        icon  = RISK_ICON.get(d["risk_label"], "")
        color = RISK_COLOR.get(d["risk_label"], "#fff")
        prob  = f"{float(d['risk_probability']) * 100:.1f}%"
        rows += (
            f"<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #333'>{d['date']}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #333;color:{color}'>{icon} {d['risk_label']}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #333'>{prob}</td>"
            f"</tr>"
        )
    color = RISK_COLOR.get(threshold, "#ff4d4d")
    icon  = RISK_ICON.get(threshold, "🔴")
    return f"""
<html><body style="font-family:sans-serif;background:#1a1a1a;color:#fff;margin:0;padding:20px">
<div style="max-width:600px;margin:auto;background:#242424;border-radius:16px;overflow:hidden">
  <div style="background:{color};padding:24px;text-align:center">
    <div style="font-size:36px">{icon}</div>
    <h2 style="margin:8px 0 0;color:#fff">{threshold} Wildfire Risk Alert</h2>
  </div>
  <div style="padding:24px">
    <p><strong>📍 Location:</strong> {location}</p>
    <p><strong>🌐 Coordinates:</strong> {lat}°N, {lon}°E</p>
    <h3 style="color:{color}">📊 High-Risk Days Detected</h3>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#333">
        <th style="padding:10px;text-align:left">Date</th>
        <th style="padding:10px;text-align:left">Risk Level</th>
        <th style="padding:10px;text-align:left">Confidence</th>
      </tr>
      {rows}
    </table>
    <p style="margin-top:20px;color:#aaa;font-size:12px">
      वन दृष्टि — Forest Fire Risk Monitoring System
    </p>
  </div>
</div></body></html>"""


def build_alert_text(location: str, lat: float, lon: float,
                     threshold: str, high_days: list) -> str:
    lines = [
        "══════════════════════════════════",
        " WILDFIRE RISK ALERT",
        "══════════════════════════════════",
        f" Location  : {location}",
        f" Threshold : {threshold}",
        f" Coords    : {lat}°N, {lon}°E",
        "",
        " High-Risk Days:",
    ]
    for d in high_days:
        prob = f"{float(d['risk_probability']) * 100:.1f}%"
        lines.append(f"  • {d['date']} | {d['risk_label']} | {prob}")
    lines += ["", " वन दृष्टि — Forest Fire Risk Monitoring System"]
    return "\n".join(lines)