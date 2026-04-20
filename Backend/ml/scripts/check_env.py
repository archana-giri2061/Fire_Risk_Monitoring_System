# check_env.py
# Diagnostic script that verifies all required Python packages and project files
# are present and accessible in the current runtime environment.
# Run via GET /api/ml/debug or directly with: python ml/scripts/check_env.py
# Useful for debugging missing dependency issues on the EC2 server.

import sys
import os
import pathlib

# Print basic interpreter information first so it is clear which Python
# environment is being checked when multiple versions are installed
print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"CWD: {os.getcwd()}")
print()

# Each tuple is (import_name, pip_package_name).
# import_name is what is passed to __import__ to test if it is installed.
# pip_package_name is the correct name to use with pip install if it is missing.
# These two names differ for some packages, e.g. sklearn vs scikit-learn.
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

all_ok = True  # Tracks whether all packages imported successfully

for module, pip_name in packages:
    try:
        __import__(module)  # Attempt to import by the module's actual import name
        print(f"  [OK] {pip_name}")
    except ImportError:
        # Print which executable is missing it so the fix command targets the right environment
        print(f"  [MISSING] {pip_name} not found in {sys.executable}")
        all_ok = False

print()

# Check that all required project files exist relative to the current working directory.
# The server always runs from the Backend/ root so these paths are relative to that.
base = pathlib.Path(os.getcwd())

for f in [
    "ml/scripts/train_model.py",          # Main model training script
    "ml/scripts/predict_forecast.py",     # 7-day forecast prediction script
    "ml/scripts/config.py",               # ML script configuration
    "ml/data/ForestfireData.xlsx",        # Historical training dataset
    "ml/models/fire_risk_model_lr.joblib", # Saved trained model file
    ".env",                                # Environment variables file
]:
    exists = (base / f).exists()
    print(f"  {'[OK]' if exists else '[MISSING]'} {f}")

print()

# Check that the database connection string is available in the environment.
# The ML scripts need this to read weather data and write predictions.
print(f"DATABASE_URL: {'SET [OK]' if os.getenv('DATABASE_URL') else 'MISSING'}")
print()

if all_ok:
    print("Environment OK - all packages present, ML pipeline should work")
else:
    # Print the exact fix command using the same executable that failed the check,
    # so the user installs into the correct environment rather than a system Python
    print(f"Missing packages detected in {sys.executable}")
    print(f"Fix: {sys.executable} -m pip install -r ml/scripts/requirements.txt")