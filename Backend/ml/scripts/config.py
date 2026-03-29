import os
from pathlib import Path
from dotenv import load_dotenv

ENV_PATHS = [
    Path(__file__).resolve().parents[2] / ".env",
    Path(__file__).resolve().parents[1] / ".env",
]
for p in ENV_PATHS:
    if p.exists():
        load_dotenv(p)
        break

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise EnvironmentError("DATABASE_URL is not set in .env")

EXCEL_PATH   = os.getenv("EXCEL_PATH",   "ml/data/ForestfireData.xlsx")
MODEL_PATH   = os.getenv("MODEL_PATH",   "ml/models/fire_risk_model_lr.joblib")

LATITUDE     = float(os.getenv("LATITUDE",  "28.002"))
LONGITUDE    = float(os.getenv("LONGITUDE", "83.036"))
LOCATION_KEY = os.getenv("LOCATION_KEY", "lumbini_28.002_83.036")

# All 6 features used for BOTH training and prediction — must never diverge
FEATURES = [
    "temp_max",
    "temp_min",
    "temp_mean",
    "humidity_mean",
    "precipitation_sum",
    "wind_speed_max",
]