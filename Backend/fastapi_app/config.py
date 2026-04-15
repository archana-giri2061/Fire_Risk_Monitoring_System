import os
from dotenv import load_dotenv

# Load .env from Backend/ root (one level up from fastapi_app/)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

class Config:
    port               = int(os.getenv("PORT", 3000))
    latitude           = float(os.getenv("LATITUDE", 28.002))
    longitude          = float(os.getenv("LONGITUDE", 83.036))
    location_key       = os.getenv("LOCATION_KEY", "lumbini_28.002_83.036")
    archive_days       = int(os.getenv("ARCHIVE_DAYS", 60))
    forecast_days      = int(os.getenv("FORECAST_DAYS", 7))
    sync_on_start      = os.getenv("SYNC_ON_START", "true").lower() == "true"
    sync_interval_mins = int(os.getenv("SYNC_INTERVAL_MINUTES", 30))
    database_url       = os.getenv("DATABASE_URL", "")
    smtp_host          = os.getenv("SMTP_HOST", "")
    smtp_port          = int(os.getenv("SMTP_PORT", 587))
    smtp_user          = os.getenv("SMTP_USER", "")
    smtp_pass          = os.getenv("SMTP_PASS", "")
    smtp_from          = os.getenv("ALERT_FROM_EMAIL", "")
    smtp_to            = os.getenv("ALERT_TO_EMAIL", "")

cfg = Config()