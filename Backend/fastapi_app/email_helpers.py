# email_helpers.py
# Provides shared constants and helper functions for building and sending
# alert and report emails via SMTP.
# Used by alerts.py for all outgoing email operations.

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import cfg  # Provides SMTP credentials and recipient address from .env

# Numeric rank for each risk level, used to compare and filter predictions.
# Higher number = higher severity. Matches the 4-class ML model output.
RISK_RANK  = {"Low": 0, "Moderate": 1, "High": 2, "Extreme": 3}

# Text labels for each risk level, used in email subjects and HTML bodies
# in place of emoji icons for compatibility with all email clients
RISK_ICON  = {"Low": "[LOW]", "Moderate": "[MODERATE]", "High": "[HIGH]", "Extreme": "[EXTREME]"}

# Hex colors for each risk level, used for table cell text and header backgrounds in HTML emails
RISK_COLOR = {"Low": "#9DC88D", "Moderate": "#F1B24A", "High": "#ff8c42", "Extreme": "#ff4d4d"}


def send_raw_email(subject: str, body_text: str, body_html: str = "") -> dict:
    """
    Sends an email via SMTP using the credentials configured in .env.
    Constructs a multipart/alternative message so email clients can choose
    between the plain-text and HTML versions based on their capabilities.

    Parameters:
        subject   : Email subject line
        body_text : Plain-text version of the email body (always required)
        body_html : Optional HTML version; if omitted only plain-text is sent

    Returns:
        A dict with a placeholder messageId and the recipient address.

    Raises:
        Exception if the SMTP connection, login, or send operation fails.
        The caller in alerts.py catches this and returns an error response.
    """
    msg = MIMEMultipart("alternative")  # "alternative" means client picks the best format to display
    msg["Subject"] = subject
    msg["From"]    = cfg.smtp_from or cfg.smtp_user  # Use dedicated From address if set, else fall back to login user
    msg["To"]      = cfg.smtp_to

    # Plain-text part is attached first; email clients prefer the last matching part,
    # so HTML being attached second means it will be preferred when supported
    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))

    # Open a fresh SMTP connection for each send rather than keeping a persistent
    # connection, since emails are infrequent (daily reports and threshold alerts)
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port) as s:
        s.starttls()                          # Upgrade the connection to TLS before sending credentials
        s.login(cfg.smtp_user, cfg.smtp_pass)
        s.send_message(msg)

    return {"messageId": "<msg@fastapi>", "recipients": [cfg.smtp_to]}


def build_alert_html(location: str, lat: float, lon: float,
                     threshold: str, high_days: list) -> str:
    """
    Builds the HTML email body for a fire risk alert.
    Uses inline CSS throughout for compatibility with email clients
    that strip or ignore external and embedded stylesheets (e.g. Gmail, Outlook).

    Parameters:
        location  : Human-readable location label, e.g. "lumbini_28.002_83.036"
        lat       : Latitude of the monitored location
        lon       : Longitude of the monitored location
        threshold : Worst risk label found, used for the header color and title
        high_days : List of dicts, each with keys: date, risk_label, risk_probability

    Returns:
        A complete HTML string ready to pass to MIMEText as the html part.
    """
    # Build one table row per high-risk day
    rows = ""
    for d in high_days:
        label = RISK_ICON.get(d["risk_label"], "")   # Bracket label e.g. [HIGH]
        color = RISK_COLOR.get(d["risk_label"], "#fff")
        prob  = f"{float(d['risk_probability']) * 100:.1f}%"  # Convert 0.0-1.0 to percentage string
        rows += (
            f"<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #333'>{d['date']}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #333;color:{color}'>{label} {d['risk_label']}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #333'>{prob}</td>"
            f"</tr>"
        )

    # Use the worst risk level's color and label for the header banner
    color = RISK_COLOR.get(threshold, "#ff4d4d")  # Fall back to Extreme red if label not found
    label = RISK_ICON.get(threshold, "[ALERT]")   # Fall back to generic label if level not found

    return f"""
<html><body style="font-family:sans-serif;background:#1a1a1a;color:#fff;margin:0;padding:20px">
<div style="max-width:600px;margin:auto;background:#242424;border-radius:16px;overflow:hidden">
  <div style="background:{color};padding:24px;text-align:center">
    <div style="font-size:24px;font-weight:bold">{label}</div>
    <h2 style="margin:8px 0 0;color:#fff">{threshold} Wildfire Risk Alert</h2>
  </div>
  <div style="padding:24px">
    <p><strong>Location:</strong> {location}</p>
    <p><strong>Coordinates:</strong> {lat}N, {lon}E</p>
    <h3 style="color:{color}">High-Risk Days Detected</h3>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#333">
        <th style="padding:10px;text-align:left">Date</th>
        <th style="padding:10px;text-align:left">Risk Level</th>
        <th style="padding:10px;text-align:left">Confidence</th>
      </tr>
      {rows}
    </table>
    <p style="margin-top:20px;color:#aaa;font-size:12px">
      Van Drishti - Forest Fire Risk Monitoring System
    </p>
  </div>
</div></body></html>"""


def build_alert_text(location: str, lat: float, lon: float,
                     threshold: str, high_days: list) -> str:
    """
    Builds the plain-text fallback email body for a fire risk alert.
    Shown by email clients that do not render HTML, and used as the
    preview snippet in inbox views before the full email is opened.

    Parameters:
        location  : Human-readable location label
        lat       : Latitude of the monitored location
        lon       : Longitude of the monitored location
        threshold : Worst risk label found, shown as the alert level
        high_days : List of dicts, each with keys: date, risk_label, risk_probability

    Returns:
        A plain string with one high-risk day per line.
    """
    label = RISK_ICON.get(threshold, "[ALERT]")  # Bracket label for the alert level

    lines = [
        "==================================",
        f" WILDFIRE RISK ALERT {label}",
        "==================================",
        f" Location  : {location}",
        f" Threshold : {threshold}",
        f" Coords    : {lat}N, {lon}E",
        "",
        " High-Risk Days:",
    ]

    # Append one line per high-risk day with date, label, and confidence percentage
    for d in high_days:
        prob       = f"{float(d['risk_probability']) * 100:.1f}%"
        day_label  = RISK_ICON.get(d["risk_label"], "")  # Bracket label per row e.g. [HIGH]
        lines.append(f"  {d['date']} | {day_label} {d['risk_label']} | {prob}")

    lines += ["", " Van Drishti - Forest Fire Risk Monitoring System"]

    return "\n".join(lines)