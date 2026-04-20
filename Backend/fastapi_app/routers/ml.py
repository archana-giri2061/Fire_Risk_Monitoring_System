# ml.py
# FastAPI router for all machine learning operations.
# Handles model training, forecast prediction, IoT-based prediction,
# metrics retrieval, and confusion matrix endpoints.
# All routes are prefixed with /api/ml.

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from database import get_pool
from config   import cfg

router = APIRouter(prefix="/api/ml", tags=["ML"])

# Resolve the Backend/ root directory (two levels above fastapi_app/routers/)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Directory where train_model.py and test_with_archive.py write their JSON output files
OUTPUTS  = BASE_DIR / "ml" / "outputs"


def _run_script(script_rel: str) -> dict:
    """
    Runs a Python script as a subprocess using the current interpreter.
    
    Parameters:
        script_rel: Path to the script relative to BASE_DIR, e.g. "ml/scripts/train_model.py"
    
    Returns:
        A dict with keys: code (exit code), stdout, stderr
    """
    script_path = BASE_DIR / script_rel
    result = subprocess.run(
        [sys.executable, "-u", str(script_path)],  # -u disables output buffering
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},  # Ensure UTF-8 output on all platforms
        cwd=str(BASE_DIR),  # Run from Backend/ so relative paths inside scripts resolve correctly
    )
    return {"code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def _read_json(filename: str) -> Optional[dict]:
    """
    Safely reads and parses a JSON file from the ml/outputs/ directory.
    Returns None if the file does not exist yet (e.g. before first training run).
    
    Parameters:
        filename: Just the filename, e.g. "metrics_train.json"
    """
    p = OUTPUTS / filename
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


async def _auto_alert() -> dict:
    """
    Triggers automated email alerts for any High or Extreme risk days
    found in the current forecast. Called automatically after predict steps.
    Imported here (not at top level) to avoid circular import with alerts router.
    """
    from routers.alerts import run_risk_email_alerts
    return await run_risk_email_alerts(min_risk="High")


@router.post(
    "/train",
    summary="Retrain model on historical data",
    response_description="stdout from train_model.py",
)
async def ml_train():
    """
    Runs ml/scripts/train_model.py to retrain the fire risk classifier.
    
    Steps performed by the script:
      - Loads ml/data/ForestfireData.xlsx (historical forest fire records)
      - Trains an XGBoost multi-class classifier across 4 risk levels
      - Saves the trained model to ml/models/fire_risk_model_lr.joblib
      - Writes training metrics to ml/outputs/metrics_train.json
    """
    try:
        r = _run_script("ml/scripts/train_model.py")
        if r["code"] != 0:
            # Script exited with a non-zero code — surface stdout and stderr for debugging
            raise HTTPException(
                status_code=500,
                detail={"ok": False, "stderr": r["stderr"], "stdout": r["stdout"]},
            )
        return {"ok": True, "message": "Model trained successfully", "stdout": r["stdout"]}
    except HTTPException:
        raise  # Re-raise HTTP exceptions unchanged so FastAPI handles status codes correctly
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-archive", summary="Test model against archive data")
async def ml_test_archive():
    """
    Runs ml/scripts/test_with_archive.py to evaluate model performance
    against the historical archive dataset.
    Writes results to ml/outputs/metrics_archive.json.
    """
    try:
        r = _run_script("ml/scripts/test_with_archive.py")
        if r["code"] != 0:
            raise HTTPException(500, detail={"ok": False, "stderr": r["stderr"]})
        return {"ok": True, "message": "Archive test completed", "stdout": r["stdout"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post(
    "/predict-forecast",
    summary="Generate 7-day risk forecast and trigger alert emails",
)
async def ml_predict_forecast():
    """
    Runs ml/scripts/predict_forecast.py to generate the next 7-day fire risk forecast.
    After the script completes, automatically sends alert emails for any
    High or Extreme risk days found in the new predictions.
    
    The script reads from daily_weather / daily_weather_forecast tables and
    writes predictions into fire_risk_predictions.
    """
    try:
        r = _run_script("ml/scripts/predict_forecast.py")
        if r["code"] != 0:
            raise HTTPException(500, detail={"ok": False, "stderr": r["stderr"]})

        # Trigger email alerts immediately after predictions are stored
        alert = await _auto_alert()

        return {
            "ok":      True,
            "message": "Forecast predicted and stored",
            "stdout":  r["stdout"],
            "alert":   alert,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/predictions", summary="Fetch stored risk predictions")
async def ml_predictions(
    limit: int = Query(7, le=30, description="Max rows to return"),
    from_date: Optional[str] = Query(None, alias="from", description="ISO date filter (YYYY-MM-DD)"),
):
    """
    Returns upcoming fire risk predictions from fire_risk_predictions table
    for the configured location coordinates.
    
    Query params:
        limit     : Number of rows to return (max 30, default 7 for a weekly view)
        from_date : If provided, returns predictions on or after this date instead of today
    """
    # Base query selects key prediction fields for the configured location
    SQL_BASE = """
        SELECT date, latitude, longitude, risk_code, risk_label,
               COALESCE(risk_probability, 0) AS risk_probability,
               model_name, created_at
        FROM fire_risk_predictions
        WHERE latitude=$1 AND longitude=$2
    """
    try:
        pool = await get_pool()

        if from_date:
            # Filter from the caller-supplied date if provided
            rows = await pool.fetch(
                SQL_BASE + " AND date >= $3::date ORDER BY date ASC LIMIT $4",
                cfg.latitude, cfg.longitude, from_date, limit,
            )
        else:
            # Default: return predictions from today onwards
            rows = await pool.fetch(
                SQL_BASE + " AND date >= CURRENT_DATE ORDER BY date ASC LIMIT $3",
                cfg.latitude, cfg.longitude, limit,
            )

        data = [
            {
                "date":             str(r["date"])[:10],          # Normalize to YYYY-MM-DD string
                "risk_code":        r["risk_code"],                # 0=Low, 1=Moderate, 2=High, 3=Extreme
                "risk_label":       r["risk_label"],
                "risk_probability": float(r["risk_probability"]),  # Classifier confidence score 0.0–1.0
                "model_name":       r["model_name"],
                "created_at":       str(r["created_at"]),
            }
            for r in rows
        ]
        return {"ok": True, "count": len(data), "location": cfg.location_key, "data": data}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get(
    "/metrics",
    summary="Get training and archive evaluation metrics",
    response_description=(
        "JSON with 'train' and 'archive' keys containing accuracy, "
        "confusion matrix, classification report, and ROC AUC scores."
    ),
)
async def ml_metrics():
    """
    Returns the contents of ml/outputs/metrics_train.json and
    ml/outputs/metrics_archive.json.
    
    These files are written by train_model.py and test_with_archive.py respectively.
    The ML Analytics page reads this endpoint to render charts and score tables.
    Returns None for a key if the corresponding file has not been generated yet.
    """
    return {
        "ok":      True,
        "train":   _read_json("metrics_train.json"),   # None if training hasn't run yet
        "archive": _read_json("metrics_archive.json"), # None if archive test hasn't run yet
    }


@router.get("/confusion-matrix", summary="Confusion matrix as JSON array")
async def ml_confusion_matrix():
    """
    Returns the raw confusion matrix from the most recent training run.
    The matrix is a 4x4 array indexed by [actual][predicted] across the four
    risk classes: Low, Moderate, High, Extreme.
    Requires at least one completed training run.
    """
    m = _read_json("metrics_train.json")
    if not m:
        raise HTTPException(404, "No training metrics found. Run POST /api/ml/train first.")
    return {
        "ok":          True,
        "matrix":      m["confusion_matrix"],
        "class_names": ["Low", "Moderate", "High", "Extreme"],
    }


@router.get("/classification-report", summary="Per-class precision/recall/F1")
async def ml_classification_report():
    """
    Returns precision, recall, and F1-score for each of the four risk classes,
    sourced from the most recent training run metrics file.
    Also includes overall validation accuracy.
    Requires at least one completed training run.
    """
    m = _read_json("metrics_train.json")
    if not m:
        raise HTTPException(404, "No training metrics found. Run POST /api/ml/train first.")
    return {
        "ok":       True,
        "report":   m["classification_report"],
        "accuracy": m.get("validation_accuracy"),  # Top-level accuracy score, may be absent in older runs
    }


@router.post("/run-all", summary="Run train, test-archive, and predict-forecast in sequence")
async def ml_run_all():
    """
    Executes all three ML pipeline steps in order:
      1. train_model.py        — retrain classifier on historical data
      2. test_with_archive.py  — evaluate model against archive dataset
      3. predict_forecast.py   — generate 7-day forecast and store predictions
    
    Stops at the first failure and reports which step failed along with its stderr.
    On full success, also triggers alert emails for High/Extreme risk days.
    """
    results: dict = {}

    for key, script in [
        ("train",        "ml/scripts/train_model.py"),
        ("test_archive", "ml/scripts/test_with_archive.py"),
        ("predict",      "ml/scripts/predict_forecast.py"),
    ]:
        r = _run_script(script)

        # Keep only the last 500 chars of stdout to avoid bloating the response
        results[key] = {"code": r["code"], "stdout": r["stdout"][-500:]}

        if r["code"] != 0:
            # Stop the pipeline and return which step failed
            results[key]["stderr"] = r["stderr"]
            raise HTTPException(
                status_code=500,
                detail={"ok": False, "failedStep": key, "results": results},
            )

    # All steps succeeded — trigger alert check on the freshly stored predictions
    results["alert"] = await _auto_alert()
    return {"ok": True, "message": "All ML steps completed successfully", "results": results}


@router.post(
    "/predict-iot",
    summary="Predict fire risk from latest IoT sensor readings",
    response_description=(
        "Risk prediction derived from the latest ESP32 sensor data "
        "(temperature and humidity from DHT22, rain sensor, wind if available). "
        "Stored separately from weather-based forecast with model_name='xgboost_iot'."
    ),
)
async def ml_predict_iot():
    """
    Reads the most recent readings from iot_sensor_readings, maps them to
    model input features, and runs the trained XGBoost classifier.
    
    Key differences from predict_forecast:
      - Uses live IoT sensor data instead of weather API data
      - Uses the same trained model file (fire_risk_model_lr.joblib)
      - Does not read from or modify the daily_weather tables
      - Stored in fire_risk_predictions with model_name = 'xgboost_iot'
      - Automatically triggers an email alert if risk_code >= 2 (High or Extreme)
    
    The script communicates its result back via a JSON_RESULT: prefixed line in stdout.
    """
    try:
        r = _run_script("ml/scripts/predict_iot.py")
        if r["code"] != 0:
            raise HTTPException(
                status_code=500,
                detail={"ok": False, "stderr": r["stderr"], "stdout": r["stdout"]},
            )

        # The script writes its structured result as a single line starting with "JSON_RESULT:"
        # This avoids having to parse unstructured stdout logs
        prediction: dict = {}
        for line in r["stdout"].splitlines():
            if line.startswith("JSON_RESULT:"):
                try:
                    prediction = json.loads(line[len("JSON_RESULT:"):])
                except Exception:
                    pass  # Malformed JSON line — prediction stays empty, alert is skipped
                break

        # Only send an alert if the prediction reached High (code 2) or Extreme (code 3)
        alert: dict = {}
        if prediction.get("risk_code", 0) >= 2:
            alert = await _auto_alert()

        return {
            "ok":        True,
            "message":   "IoT-based risk prediction complete",
            "prediction": prediction,
            "alert":     alert,
            "stdout":    r["stdout"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))