"""
check_env.py — Run via GET /api/ml/debug
"""
import sys, os, subprocess

print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"CWD: {os.getcwd()}")
print()

packages = [
    ("joblib",     "joblib"),
    ("pandas",     "pandas"),
    ("numpy",      "numpy"),
    ("sklearn",    "scikit-learn"),
    ("xgboost",    "xgboost"),
    ("sqlalchemy", "sqlalchemy"),
    ("openpyxl",   "openpyxl"),
    ("dotenv",     "python-dotenv"),
    ("psycopg2",   "psycopg2-binary"),
]

all_ok = True
for module, pip_name in packages:
    try:
        __import__(module)
        print(f"  ✅ {pip_name}")
    except ImportError:
        print(f"  ❌ {pip_name} MISSING from {sys.executable}")
        all_ok = False

print()

# Check files
import pathlib
base = pathlib.Path(os.getcwd())
for f in ["ml/scripts/train_model.py","ml/scripts/predict_forecast.py",
          "ml/scripts/config.py","ml/data/ForestfireData.xlsx",
          "ml/models/fire_risk_model_lr.joblib",".env"]:
    exists = (base / f).exists()
    print(f"  {'✅' if exists else '❌'} {f}")

print()
print(f"DATABASE_URL: {'SET ✅' if os.getenv('DATABASE_URL') else 'MISSING ❌'}")
print()

if all_ok:
    print("✅ Environment OK — ML should work")
else:
    print(f"❌ Missing packages in {sys.executable}")
    print(f"   Fix: {sys.executable} -m pip install -r ml/scripts/requirements.txt")