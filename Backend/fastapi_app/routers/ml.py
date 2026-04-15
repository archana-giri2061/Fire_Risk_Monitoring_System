"""
routers/ml.py
=============
ML routes: train, predict, metrics, and full visualization data.

All endpoints are prefixed with /api/ml.
"""
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

# Backend/ lives two levels above fastapi_app/routers/
BASE_DIR  = Path(__file__).resolve().parent.parent.parent
OUTPUTS   = BASE_DIR / "ml" / "outputs"


# ── Helper: run a Python script as subprocess ───────────────────────────────
def _run_script(script_rel: str) -> dict:
    """Run ml/scripts/<script> with the current interpreter."""
    script_path = BASE_DIR / script_rel
    result = subprocess.run(
        [sys.executable, "-u", str(script_path)],
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        cwd=str(BASE_DIR),
    )
    return {"code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def _read_json(filename: str) -> Optional[dict]:
    """Safely read a JSON file from ml/outputs/."""
    p = OUTPUTS / filename
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


async def _auto_alert() -> dict:
    """Trigger automated email alerts after a forecast run."""
    from routers.alerts import run_risk_email_alerts
    return await run_risk_email_alerts(min_risk="High")


# ── POST /api/ml/train ──────────────────────────────────────────────────────
@router.post(
    "/train",
    summary="Retrain XGBoost model on historical data",
    response_description="stdout from train_model.py",
)
async def ml_train():
    """
    Runs `ml/scripts/train_model.py`.

    - Loads `ml/data/ForestfireData.xlsx`
    - Trains XGBoost multi-class classifier (4 risk levels)
    - Saves model to `ml/models/fire_risk_model_lr.joblib`
    - Saves metrics to `ml/outputs/metrics_train.json`
    """
    try:
        r = _run_script("ml/scripts/train_model.py")
        if r["code"] != 0:
            raise HTTPException(
                status_code=500,
                detail={"ok": False, "stderr": r["stderr"], "stdout": r["stdout"]},
            )
        return {"ok": True, "message": "Model trained successfully", "stdout": r["stdout"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── POST /api/ml/test-archive ───────────────────────────────────────────────
@router.post("/test-archive", summary="Test model against archive data")
async def ml_test_archive():
    """Runs `ml/scripts/test_with_archive.py` and returns metrics."""
    try:
        r = _run_script("ml/scripts/test_with_archive.py")
        if r["code"] != 0:
            raise HTTPException(500, detail={"ok": False, "stderr": r["stderr"]})
        return {"ok": True, "message": "Archive test completed", "stdout": r["stdout"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── POST /api/ml/predict-forecast ──────────────────────────────────────────
@router.post(
    "/predict-forecast",
    summary="Generate 7-day risk forecast and trigger alert emails",
)
async def ml_predict_forecast():
    """
    Runs `ml/scripts/predict_forecast.py`, stores predictions in DB,
    then automatically sends alert emails for High/Extreme days.
    """
    try:
        r = _run_script("ml/scripts/predict_forecast.py")
        if r["code"] != 0:
            raise HTTPException(500, detail={"ok": False, "stderr": r["stderr"]})
        alert = await _auto_alert()
        return {
            "ok": True,
            "message": "Forecast predicted and stored",
            "stdout": r["stdout"],
            "alert": alert,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── GET /api/ml/predictions ─────────────────────────────────────────────────
@router.get("/predictions", summary="Fetch stored risk predictions")
async def ml_predictions(
    limit: int = Query(7, le=30, description="Max rows to return"),
    from_date: Optional[str] = Query(None, alias="from", description="ISO date filter (YYYY-MM-DD)"),
):
    """Returns upcoming fire risk predictions from the database."""
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
            rows = await pool.fetch(
                SQL_BASE + " AND date >= $3::date ORDER BY date ASC LIMIT $4",
                cfg.latitude, cfg.longitude, from_date, limit,
            )
        else:
            rows = await pool.fetch(
                SQL_BASE + " AND date >= CURRENT_DATE ORDER BY date ASC LIMIT $3",
                cfg.latitude, cfg.longitude, limit,
            )

        data = [
            {
                "date":             str(r["date"])[:10],
                "risk_code":        r["risk_code"],
                "risk_label":       r["risk_label"],
                "risk_probability": float(r["risk_probability"]),
                "model_name":       r["model_name"],
                "created_at":       str(r["created_at"]),
            }
            for r in rows
        ]
        return {"ok": True, "count": len(data), "location": cfg.location_key, "data": data}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── GET /api/ml/metrics ─────────────────────────────────────────────────────
@router.get(
    "/metrics",
    summary="Get training & archive evaluation metrics",
    response_description=(
        "JSON with 'train' and 'archive' keys containing accuracy, "
        "confusion matrix, classification report, and ROC AUC scores."
    ),
)
async def ml_metrics():
    """
    Returns the contents of `ml/outputs/metrics_train.json`
    and `ml/outputs/metrics_archive.json`.

    These files are written by `train_model.py` and `test_with_archive.py`.
    The ML Analytics page (`/ml-analytics`) reads this endpoint.
    """
    return {
        "ok":      True,
        "train":   _read_json("metrics_train.json"),
        "archive": _read_json("metrics_archive.json"),
    }


# ── GET /api/ml/confusion-matrix ────────────────────────────────────────────
@router.get("/confusion-matrix", summary="Confusion matrix as JSON array")
async def ml_confusion_matrix():
    """Returns the raw confusion matrix from the latest training run."""
    m = _read_json("metrics_train.json")
    if not m:
        raise HTTPException(404, "No training metrics found. Run POST /api/ml/train first.")
    return {
        "ok":          True,
        "matrix":      m["confusion_matrix"],
        "class_names": ["Low", "Moderate", "High", "Extreme"],
    }


# ── GET /api/ml/classification-report ──────────────────────────────────────
@router.get("/classification-report", summary="Per-class precision/recall/F1")
async def ml_classification_report():
    """Returns precision, recall, and F1-score per risk class."""
    m = _read_json("metrics_train.json")
    if not m:
        raise HTTPException(404, "No training metrics found. Run POST /api/ml/train first.")
    return {
        "ok":     True,
        "report": m["classification_report"],
        "accuracy": m.get("validation_accuracy"),
    }


# ── POST /api/ml/run-all ────────────────────────────────────────────────────
@router.post("/run-all", summary="Run train → test-archive → predict-forecast in sequence")
async def ml_run_all():
    """
    Executes all three ML steps in order:
    1. `train_model.py`
    2. `test_with_archive.py`
    3. `predict_forecast.py`

    Stops at the first failure and reports which step failed.
    """
    results: dict = {}
    for key, script in [
        ("train",        "ml/scripts/train_model.py"),
        ("test_archive", "ml/scripts/test_with_archive.py"),
        ("predict",      "ml/scripts/predict_forecast.py"),
    ]:
        r = _run_script(script)
        results[key] = {"code": r["code"], "stdout": r["stdout"][-500:]}
        if r["code"] != 0:
            results[key]["stderr"] = r["stderr"]
            raise HTTPException(
                status_code=500,
                detail={"ok": False, "failedStep": key, "results": results},
            )

    results["alert"] = await _auto_alert()
    return {"ok": True, "message": "All ML steps completed successfully", "results": results}


# ── POST /api/ml/predict-iot ────────────────────────────────────────────────
@router.post(
    "/predict-iot",
    summary="Predict fire risk from latest IoT sensor readings",
    response_description=(
        "Risk prediction derived from the latest ESP32 sensor data "
        "(temperature + humidity from DHT22, rain sensor, wind if available). "
        "Stored separately from weather-based forecast with model_name='xgboost_iot'."
    ),
)
async def ml_predict_iot():
    """
    Reads the most recent readings from `iot_sensor_readings`,
    maps them to model features, and runs the trained XGBoost classifier.

    - Uses the **same trained model** as `predict_forecast.py`
    - Does **not** use or modify `daily_weather` data
    - Stored in `fire_risk_predictions` with `model_name = 'xgboost_iot'`
    - Automatically triggers email alert if risk is High or Extreme
    """
    try:
        r = _run_script("ml/scripts/predict_iot.py")
        if r["code"] != 0:
            raise HTTPException(
                status_code=500,
                detail={"ok": False, "stderr": r["stderr"], "stdout": r["stdout"]},
            )

        # Parse the JSON result line from stdout
        prediction: dict = {}
        for line in r["stdout"].splitlines():
            if line.startswith("JSON_RESULT:"):
                try:
                    prediction = json.loads(line[len("JSON_RESULT:"):])
                except Exception:
                    pass
                break

        # Auto-alert if high/extreme risk detected
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