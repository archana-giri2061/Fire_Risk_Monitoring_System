import sys
import json
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from database import get_pool
from config import cfg

router = APIRouter(prefix="/api/ml", tags=["ML"])

# Backend/ is two levels up from fastapi_app/routers/
BASE_DIR = Path(__file__).resolve().parent.parent.parent


def run_python(script_rel: str) -> dict:
    import os
    script_path = BASE_DIR / script_rel
    result = subprocess.run(
        [sys.executable, "-u", str(script_path)],
        capture_output=True, text=True,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        cwd=str(BASE_DIR),
    )
    return {"code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


async def _auto_alert() -> dict:
    from routers.alerts import run_risk_email_alerts
    return await run_risk_email_alerts(min_risk="High")


@router.post("/train")
async def ml_train():
    try:
        r = run_python("ml/scripts/train_model.py")
        if r["code"] != 0:
            raise HTTPException(500, detail={"ok": False, "stderr": r["stderr"], "stdout": r["stdout"]})
        return {"ok": True, "message": "Model trained successfully", "stdout": r["stdout"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/test-archive")
async def ml_test_archive():
    try:
        r = run_python("ml/scripts/test_with_archive.py")
        if r["code"] != 0:
            raise HTTPException(500, detail={"ok": False, "stderr": r["stderr"]})
        return {"ok": True, "message": "Archive test completed", "stdout": r["stdout"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/predict-forecast")
async def ml_predict_forecast():
    try:
        r = run_python("ml/scripts/predict_forecast.py")
        if r["code"] != 0:
            raise HTTPException(500, detail={"ok": False, "stderr": r["stderr"]})
        alert = await _auto_alert()
        return {"ok": True, "message": "Forecast predicted and stored",
                "stdout": r["stdout"], "alert": alert}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/predictions")
async def ml_predictions(
    limit: int = Query(7, le=30),
    from_date: Optional[str] = Query(None, alias="from"),
):
    try:
        pool = await get_pool()
        if from_date:
            rows = await pool.fetch(
                """SELECT date,latitude,longitude,risk_code,risk_label,
                          COALESCE(risk_probability,0) AS risk_probability,
                          model_name,created_at
                   FROM fire_risk_predictions
                   WHERE latitude=$1 AND longitude=$2 AND date>=$3::date
                   ORDER BY date ASC LIMIT $4""",
                cfg.latitude, cfg.longitude, from_date, limit,
            )
        else:
            rows = await pool.fetch(
                """SELECT date,latitude,longitude,risk_code,risk_label,
                          COALESCE(risk_probability,0) AS risk_probability,
                          model_name,created_at
                   FROM fire_risk_predictions
                   WHERE latitude=$1 AND longitude=$2 AND date>=CURRENT_DATE
                   ORDER BY date ASC LIMIT $3""",
                cfg.latitude, cfg.longitude, limit,
            )
        data = [{
            "date":             str(r["date"])[:10],
            "risk_code":        r["risk_code"],
            "risk_label":       r["risk_label"],
            "risk_probability": float(r["risk_probability"]),
            "model_name":       r["model_name"],
            "created_at":       str(r["created_at"]),
        } for r in rows]
        return {"ok": True, "count": len(data), "location": cfg.location_key, "data": data}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/metrics")
async def ml_metrics():
    def read_json(filename: str):
        p = BASE_DIR / "ml" / "outputs" / filename
        return json.loads(p.read_text()) if p.exists() else None
    return {"ok": True, "train": read_json("metrics_train.json"),
            "archive": read_json("metrics_archive.json")}


@router.post("/run-all")
async def ml_run_all():
    results: dict = {}
    for key, script in [
        ("train",        "ml/scripts/train_model.py"),
        ("test_archive", "ml/scripts/test_with_archive.py"),
        ("predict",      "ml/scripts/predict_forecast.py"),
    ]:
        r = run_python(script)
        results[key] = {"code": r["code"], "stdout": r["stdout"][-500:]}
        if r["code"] != 0:
            results[key]["stderr"] = r["stderr"]
            raise HTTPException(500, detail={"ok": False, "failedStep": key, "results": results})
    results["alert"] = await _auto_alert()
    return {"ok": True, "message": "All ML steps completed", "results": results}