"""
config.py — ML script configuration
Works both locally (reads .env file) and on Render (reads env vars directly)
"""
import os
from pathlib import Path

# ── Load .env file only if it exists (local dev) ──────────────────────────
# On Render, env vars are injected directly — no .env file needed
try:
    from dotenv import load_dotenv
    ENV_PATHS = [
        Path(__file__).resolve().parents[2] / ".env",   # Backend/.env
        Path(__file__).resolve().parents[1] / ".env",   # ml/.env
        Path(os.getcwd()) / ".env",                     # cwd/.env
    ]
    for p in ENV_PATHS:
        if p.exists():
            load_dotenv(p, override=False)  # don't override existing env vars
            print(f" [config] Loaded .env from: {p}")
            break
except ImportError:
    pass  # python-dotenv not installed — rely on system env vars

# ── Database ───────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise EnvironmentError(
        "DATABASE_URL is not set!\n"
        "  Local dev: add DATABASE_URL to Backend/.env\n"
        "  Render: add DATABASE_URL in Dashboard → Environment"
    )

# Add SSL for Render PostgreSQL (internal URL doesn't need sslmode but external does)
if "render.com" in DATABASE_URL and "sslmode" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL + "?sslmode=require"

# ── ML file paths ──────────────────────────────────────────────────────────
EXCEL_PATH = os.getenv("EXCEL_PATH",  "ml/data/ForestfireData.xlsx")
MODEL_PATH = os.getenv("MODEL_PATH",  "ml/models/fire_risk_model_lr.joblib")

# ── Location ───────────────────────────────────────────────────────────────
LATITUDE     = float(os.getenv("LATITUDE",  "28.002"))
LONGITUDE    = float(os.getenv("LONGITUDE", "83.036"))
LOCATION_KEY = os.getenv("LOCATION_KEY", "lumbini_28.002_83.036")

# ── Feature columns (must match training AND prediction) ───────────────────
FEATURES = [
    "temp_max",
    "temp_min",
    "temp_mean",
    "humidity_mean",
    "precipitation_sum",
    "wind_speed_max",
]

# ── Debug print (visible in Render logs) ──────────────────────────────────
print(f" [config] DATABASE_URL: {'SET ✅' if DATABASE_URL else 'MISSING ❌'}")
print(f" [config] LATITUDE={LATITUDE}, LONGITUDE={LONGITUDE}")
print(f" [config] MODEL_PATH={MODEL_PATH}")