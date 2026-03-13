import os
from pathlib import Path
from dotenv import load_dotenv

# Load Backend/.env (works when running from Backend or project root)
ENV_PATHS = [
    Path(__file__).resolve().parents[2] / ".env",  # Backend/.env
    Path(__file__).resolve().parents[1] / ".env",  # Backend/ml/.env (fallback)
]

for p in ENV_PATHS:
    if p.exists():
        load_dotenv(p)
        break

DATABASE_URL = os.getenv("DATABASE_URL")

EXCEL_PATH = os.getenv("EXCEL_PATH", "Backend/ml/data/ForestfireData.xlsx")
MODEL_PATH = os.getenv("MODEL_PATH", "Backend/ml/models/fire_risk_model_lr.joblib")

LATITUDE = float(os.getenv("LATITUDE", "28.002"))
LONGITUDE = float(os.getenv("LONGITUDE", "83.036"))
LOCATION_KEY = os.getenv("LOCATION_KEY", "lumbini_28.002_83.036")

FEATURES = ["temp_max", "temp_min", "temp_mean", "humidity_mean"]