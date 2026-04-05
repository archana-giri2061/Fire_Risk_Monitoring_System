"""
check_env.py — Run via GET /api/ml/debug to verify the Python environment
"""
import sys
import os

print(f"Python version: {sys.version}")
print(f"CWD: {os.getcwd()}")
print(f"PATH: {os.environ.get('PATH', 'not set')}")
print()

packages = [
    ("joblib",      "joblib"),
    ("pandas",      "pandas"),
    ("numpy",       "numpy"),
    ("sklearn",     "scikit-learn"),
    ("xgboost",     "xgboost"),
    ("sqlalchemy",  "sqlalchemy"),
    ("openpyxl",    "openpyxl"),
    ("dotenv",      "python-dotenv"),
    ("psycopg2",    "psycopg2-binary"),
]

all_ok = True
for module, pip_name in packages:
    try:
        __import__(module)
        print(f"  ✅ {pip_name}")
    except ImportError:
        print(f"  ❌ {pip_name} — MISSING")
        all_ok = False

print()
# Check critical files
import pathlib
base = pathlib.Path(os.getcwd())
files = [
    "ml/scripts/train_model.py",
    "ml/scripts/predict_forecast.py",
    "ml/scripts/config.py",
    "ml/data/ForestfireData.xlsx",
    "ml/models/fire_risk_model_lr.joblib",
    ".env",
]
for f in files:
    exists = (base / f).exists()
    print(f"  {'✅' if exists else '❌'} {f}")

print()
if all_ok:
    print("✅ Environment OK")
else:
    print("❌ Some packages missing — run: pip install -r ml/scripts/requirements.txt")
