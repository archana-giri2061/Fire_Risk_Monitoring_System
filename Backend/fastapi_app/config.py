# config.py
# Loads all environment variables from the Backend/.env file and exposes
# them as typed attributes on a single cfg object used across the application.

import os
from dotenv import load_dotenv

# Load the .env file from Backend/ root, which is one level above fastapi_app/
# Using an absolute path based on this file's location so it works regardless
# of what directory the server is started from
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))


class Config:
    """
    Central configuration object populated from environment variables.
    All values have safe fallback defaults so the app starts without a .env
    during local development, but production deployments must set them explicitly.
    """

    # Port the FastAPI server listens on (note: Express uses this same value on port 3000)
    port               = int(os.getenv("PORT", 3000))

    # Geographic coordinates of the monitored location (default: Lumbini, Nepal)
    latitude           = float(os.getenv("LATITUDE", 28.002))
    longitude          = float(os.getenv("LONGITUDE", 83.036))

    # Human-readable location identifier used as a DB key and in email subjects
    location_key       = os.getenv("LOCATION_KEY", "lumbini_28.002_83.036")

    # How many days of historical weather data to fetch from the Open-Meteo archive API
    archive_days       = int(os.getenv("ARCHIVE_DAYS", 60))

    # How many days ahead to fetch from the Open-Meteo forecast API
    forecast_days      = int(os.getenv("FORECAST_DAYS", 7))

    # Whether to run a weather sync immediately when the server starts
    sync_on_start      = os.getenv("SYNC_ON_START", "true").lower() == "true"

    # How often (in minutes) the background sync job runs after startup
    sync_interval_mins = int(os.getenv("SYNC_INTERVAL_MINUTES", 30))

    # Full PostgreSQL connection string, e.g. postgresql://user:pass@host:5432/dbname
    # Must be set in .env — empty string will cause a connection error at startup
    database_url       = os.getenv("DATABASE_URL", "")

    # SMTP server hostname for sending alert and report emails, e.g. smtp.gmail.com
    smtp_host          = os.getenv("SMTP_HOST", "")

    # SMTP server port (587 is the standard port for STARTTLS)
    smtp_port          = int(os.getenv("SMTP_PORT", 587))

    # SMTP login credentials for the sending email account
    smtp_user          = os.getenv("SMTP_USER", "")
    smtp_pass          = os.getenv("SMTP_PASS", "")

    # Email address that appears in the From field of outgoing alert emails
    smtp_from          = os.getenv("ALERT_FROM_EMAIL", "")

    # Recipient email address for all alerts and daily reports
    smtp_to            = os.getenv("ALERT_TO_EMAIL", "")


# Single shared instance imported by all other modules
# Usage: from config import cfg
cfg = Config()