"""
predict_iot.py
==============
Predicts fire risk from LATEST IoT sensor readings in the DB.
Uses the same trained XGBoost model — does NOT touch daily_weather data.
Stores result with model_name='xgboost_iot' so it never conflicts with
the weather-based forecast (model_name='xgboost').

Usage (from Backend/):
    python ml/scripts/predict_iot.py
"""

import sys
import json
import joblib
import pandas as pd
from datetime import date
from pathlib import Path
from sqlalchemy import create_engine, text

from config import DATABASE_URL, MODEL_PATH, FEATURES, LATITUDE, LONGITUDE
from feature_label import code_to_label


CREATE_PRED_TABLE = """
CREATE TABLE IF NOT EXISTS fire_risk_predictions (
  id               SERIAL PRIMARY KEY,
  latitude         DOUBLE PRECISION NOT NULL,
  longitude        DOUBLE PRECISION NOT NULL,
  date             DATE NOT NULL,
  risk_code        INT NOT NULL,
  risk_label       TEXT NOT NULL,
  risk_probability DOUBLE PRECISION DEFAULT 0,
  model_name       TEXT NOT NULL DEFAULT 'xgboost',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
"""

FIX_CONSTRAINT = """
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fire_risk_predictions_lat_lon_date_model_key'
      AND conrelid = 'fire_risk_predictions'::regclass
  ) THEN
    ALTER TABLE fire_risk_predictions
      ADD CONSTRAINT fire_risk_predictions_lat_lon_date_model_key
      UNIQUE (latitude, longitude, date, model_name);
  END IF;
END $$;
"""


def load_latest_iot(engine) -> dict:
    """
    Fetch the most recent reading per sensor_type from iot_sensor_readings.
    Maps sensor types to feature-compatible values.
    """
    q = text("""
        SELECT DISTINCT ON (LOWER(sensor_type))
            LOWER(sensor_type) AS sensor_type,
            value,
            measured_at
        FROM iot_sensor_readings
        ORDER BY LOWER(sensor_type), measured_at DESC
    """)
    with engine.connect() as conn:
        rows = conn.execute(q).fetchall()

    if not rows:
        return {}

    mapping: dict[str, float] = {}
    for row in rows:
        st  = row.sensor_type.lower()
        val = float(row.value)
        if st in ("temperature", "temp"):
            mapping["temperature"] = val
        elif st in ("humidity", "hum"):
            mapping["humidity"] = val
        elif st in ("rain", "rainfall", "precipitation", "yl83"):
            # YL-83 raw value: lower = wetter
            mapping["rain_mm"] = 0.0 if val > 700 else (2.0 if val > 300 else 8.0)
        elif st in ("wind", "wind_speed"):
            mapping["wind_kmh"] = val
        elif st in ("co2", "smoke", "mq135"):
            mapping["co2_ppm"] = val

    return mapping


def build_features(sensor_data: dict) -> "pd.DataFrame | None":
    """
    Map IoT readings to the 6 model features.
    Requires at least temperature + humidity (DHT22).
    """
    temp = sensor_data.get("temperature")
    hum  = sensor_data.get("humidity")

    if temp is None or hum is None:
        print("ERROR: temperature or humidity reading not found in DB.")
        print("  Make sure ESP32 is sending DHT22 data to POST /api/sensor/ingest")
        return None

    rain = sensor_data.get("rain_mm",  0.0)
    wind = sensor_data.get("wind_kmh", 0.0)

    row = {
        "temp_max":          temp + 2.0,    # approximate daily max from live reading
        "temp_min":          max(0, temp - 3.0),
        "temp_mean":         temp,
        "humidity_mean":     max(0, min(100, hum)),
        "precipitation_sum": rain,
        "wind_speed_max":    wind,
    }
    return pd.DataFrame([row])


def store_prediction(engine, risk_code: int, risk_label: str, risk_prob: float) -> None:
    sql = text("""
        INSERT INTO fire_risk_predictions
          (latitude, longitude, date, risk_code, risk_label, risk_probability, model_name)
        VALUES (:lat, :lon, :date, :code, :label, :prob, 'xgboost_iot')
        ON CONFLICT (latitude, longitude, date, model_name)
        DO UPDATE SET
          risk_code        = EXCLUDED.risk_code,
          risk_label       = EXCLUDED.risk_label,
          risk_probability = EXCLUDED.risk_probability,
          created_at       = NOW()
    """)
    with engine.begin() as conn:
        conn.execute(sql, {
            "lat":   LATITUDE,
            "lon":   LONGITUDE,
            "date":  date.today(),
            "code":  risk_code,
            "label": risk_label,
            "prob":  risk_prob,
        })


def main():
    print("IoT Sensor Risk Prediction")
    print("=" * 40)

    engine = create_engine(DATABASE_URL)
    with engine.begin() as conn:
        conn.execute(text(CREATE_PRED_TABLE))
        conn.execute(text(FIX_CONSTRAINT))

    # Load latest sensor readings
    print("Loading latest IoT sensor readings...")
    sensor_data = load_latest_iot(engine)

    if not sensor_data:
        print("ERROR: No IoT sensor readings in iot_sensor_readings table.")
        sys.exit(1)

    print(f"  Raw sensor data: {sensor_data}")

    # Build feature vector
    df = build_features(sensor_data)
    if df is None:
        sys.exit(1)

    print("\n  Feature vector:")
    for col in FEATURES:
        print(f"    {col:25s}: {df[col].values[0]:.2f}")

    # Predict
    model = joblib.load(MODEL_PATH)
    pred  = int(model.predict(df[FEATURES])[0])
    proba = float(model.predict_proba(df[FEATURES]).max()) if hasattr(model, "predict_proba") else 0.0
    label = code_to_label(pred)

    print(f"\n  Result  : {label} (code {pred}, confidence {proba:.2%})")

    # Store — separate from weather forecast (different model_name)
    store_prediction(engine, pred, label, proba)
    print("  Stored in fire_risk_predictions (model_name=xgboost_iot) ✅")

    # JSON output for Node.js to parse
    result = {
        "ok":               True,
        "source":           "iot_sensors",
        "risk_code":        pred,
        "risk_label":       label,
        "risk_probability": round(proba, 4),
        "date":             str(date.today()),
        "sensor_data":      sensor_data,
        "features_used":    {col: round(float(df[col].values[0]), 2) for col in FEATURES},
    }
    print("\nJSON_RESULT:" + json.dumps(result))

    if pred >= 2:
        print(f"\n  ⚠ WARNING: {label} risk from IoT sensors — auto-alert will trigger.")


if __name__ == "__main__":
    main()