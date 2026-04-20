# config.py
# Configuration module for all ML pipeline scripts (train_model.py,
# predict_forecast.py, predict_iot.py, etc.).
# Loads environment variables from a .env file in local development,
# and reads them directly from the system environment in production
# where they are injected by the hosting platform (e.g. AWS, Render).

import os
from pathlib import Path


# Attempt to load a .env file for local development.
# python-dotenv may not be installed in all environments, so the import
# is wrapped in a try/except — if it is missing the script falls back
# to reading environment variables that are already set in the shell.
try:
    from dotenv import load_dotenv

    # Search these locations in order and load the first .env file found.
    # This covers the common cases: running from Backend/, from ml/, or from cwd.
    ENV_PATHS = [
        Path(__file__).resolve().parents[2] / ".env",  # Backend/.env (preferred — two levels up from ml/scripts/)
        Path(__file__).resolve().parents[1] / ".env",  # ml/.env (fallback if running from ml/)
        Path(os.getcwd()) / ".env",                    # Current working directory (last resort)
    ]

    for p in ENV_PATHS:
        if p.exists():
            # override=False means already-set environment variables are not overwritten.
            # This ensures production env vars injected by the platform take precedence
            # over anything in a leftover .env file.
            load_dotenv(p, override=False)
            print(f"[config] Loaded .env from: {p}")
            break

except ImportError:
    # python-dotenv is not installed — this is expected in production environments
    # where env vars are injected directly and the package may not be present.
    pass


# DATABASE_URL is required — all ML scripts need database access to read
# weather data and write predictions. Fail immediately with a clear message
# rather than letting scripts crash later with a cryptic connection error.
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise EnvironmentError(
        "DATABASE_URL is not set.\n"
        "  Local dev : add DATABASE_URL to Backend/.env\n"
        "  Production: set DATABASE_URL in your hosting platform environment settings"
    )

# Render's external PostgreSQL URLs require SSL but do not include sslmode in the
# connection string by default. Appending it here ensures the connection is encrypted
# when connecting from outside Render's internal network.
if "render.com" in DATABASE_URL and "sslmode" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL + "?sslmode=require"


# Paths to the Excel training dataset and the saved model file.
# Defaults are relative to Backend/ which is the expected working directory
# when scripts are launched by the Express or FastAPI backend.
EXCEL_PATH = os.getenv("EXCEL_PATH", "ml/data/ForestfireData.xlsx")
MODEL_PATH = os.getenv("MODEL_PATH", "ml/models/fire_risk_model_lr.joblib")


# Geographic coordinates of the monitored location.
# Must match the values used when weather data was fetched and stored,
# since the DB queries in predict scripts filter by these exact coordinates.
LATITUDE     = float(os.getenv("LATITUDE",  "28.002"))
LONGITUDE    = float(os.getenv("LONGITUDE", "83.036"))
LOCATION_KEY = os.getenv("LOCATION_KEY", "lumbini_28.002_83.036")


# Feature column names used as model inputs.
# This list must be identical in train_model.py, predict_forecast.py,
# and predict_iot.py — any mismatch will cause the model to raise a
# feature name or shape error at prediction time.
FEATURES = [
    "temp_max",           # Daily maximum temperature in Celsius
    "temp_min",           # Daily minimum temperature in Celsius
    "temp_mean",          # Daily mean temperature in Celsius
    "humidity_mean",      # Mean relative humidity percentage
    "precipitation_sum",  # Total precipitation in mm
    "wind_speed_max",     # Maximum wind speed in km/h
]


# Startup log lines visible in server logs and the FastAPI subprocess stdout.
# Helps confirm which config values were actually loaded when debugging
# environment issues on the EC2 or Render instance.
print(f"[config] DATABASE_URL: {'SET [OK]' if DATABASE_URL else 'MISSING'}")
print(f"[config] LATITUDE={LATITUDE}, LONGITUDE={LONGITUDE}")
print(f"[config] MODEL_PATH={MODEL_PATH}")