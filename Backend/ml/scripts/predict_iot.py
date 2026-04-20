# predict_iot.py
# Predicts fire risk using the latest IoT sensor readings stored in the database.
# Uses the same trained XGBoost model as predict_forecast.py but reads from
# iot_sensor_readings instead of daily_weather_forecast.
# Stores results with model_name='xgboost_iot' so they never conflict with
# weather-based predictions stored under model_name='xgboost'.
#
# Usage (run from Backend/):
#     python ml/scripts/predict_iot.py

import sys
import json
import joblib
import pandas as pd
from datetime import date
from pathlib import Path
from sqlalchemy import create_engine, text

from config import DATABASE_URL, MODEL_PATH, FEATURES, LATITUDE, LONGITUDE
from feature_label import code_to_label  # Converts integer risk codes to label strings


# DDL to create the predictions table if it does not already exist.
# Identical to the one in predict_forecast.py — both scripts are designed
# to be runnable independently without requiring prior setup.
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

# Adds the UNIQUE constraint on (latitude, longitude, date, model_name) if it does
# not already exist. Safe to run multiple times on tables created without the constraint.
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
    Fetches the single most recent reading for each sensor type from iot_sensor_readings.
    DISTINCT ON (LOWER(sensor_type)) with ORDER BY measured_at DESC ensures only the
    latest value per type is returned, not the full history.

    Maps the raw sensor type strings sent by the ESP32 firmware to normalised
    keys used by build_features(). Handles common naming variations from different
    firmware versions, e.g. "temp" and "temperature" both map to "temperature".

    Returns:
        A dict of normalised sensor readings, e.g.:
        {"temperature": 32.5, "humidity": 61.0, "rain_mm": 2.0}
        Returns an empty dict if the table has no rows yet.
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
            # YL-83 is a resistive rain sensor — its raw analog value is inversely
            # proportional to wetness. Convert to approximate mm buckets:
            # > 700 (dry)  -> 0.0 mm
            # 300-700 (wet) -> 2.0 mm
            # < 300 (heavy) -> 8.0 mm
            mapping["rain_mm"] = 0.0 if val > 700 else (2.0 if val > 300 else 8.0)

        elif st in ("wind", "wind_speed"):
            mapping["wind_kmh"] = val

        elif st in ("co2", "smoke", "mq135"):
            # MQ-135 gas sensor — stored as co2_ppm for reference but not
            # currently used as a direct model feature
            mapping["co2_ppm"] = val

    return mapping


def build_features(sensor_data: dict) -> "pd.DataFrame | None":
    """
    Maps the normalised IoT sensor readings to the 6 feature columns expected
    by the trained model. Temperature and humidity from the DHT22 sensor are
    required — all other features fall back to 0.0 if not present.

    Since the IoT device reports a single instantaneous reading rather than
    a full day's min/max, daily range values are approximated:
      temp_max = current reading + 2 degrees (typical afternoon peak offset)
      temp_min = current reading - 3 degrees (typical overnight low offset, floored at 0)

    Parameters:
        sensor_data: Dict returned by load_latest_iot()

    Returns:
        Single-row DataFrame with all 6 model feature columns,
        or None if temperature or humidity is missing.
    """
    temp = sensor_data.get("temperature")
    hum  = sensor_data.get("humidity")

    # Cannot make a meaningful prediction without at minimum these two readings
    if temp is None or hum is None:
        print("ERROR: temperature or humidity reading not found in DB.")
        print("Make sure ESP32 is sending DHT22 data to POST /api/sensor/ingest")
        return None

    rain = sensor_data.get("rain_mm",  0.0)  # Default to dry if rain sensor not connected
    wind = sensor_data.get("wind_kmh", 0.0)  # Default to calm if wind sensor not connected

    row = {
        "temp_max":          temp + 2.0,           # Approximated daily maximum
        "temp_min":          max(0, temp - 3.0),   # Approximated daily minimum, floored at 0
        "temp_mean":         temp,                  # Live reading used directly as mean
        "humidity_mean":     max(0, min(100, hum)), # Clamp to valid 0-100% range
        "precipitation_sum": rain,
        "wind_speed_max":    wind,
    }
    return pd.DataFrame([row])


def store_prediction(engine, risk_code: int, risk_label: str, risk_prob: float) -> None:
    """
    Upserts today's IoT-based prediction into fire_risk_predictions.
    Uses model_name='xgboost_iot' so this row never overwrites the weather-based
    forecast stored under model_name='xgboost' for the same date and coordinates.

    Parameters:
        engine     : SQLAlchemy engine connected to the database
        risk_code  : Integer risk level (0=Low, 1=Moderate, 2=High, 3=Extreme)
        risk_label : Human-readable label string
        risk_prob  : Model confidence score for the predicted class (0.0 to 1.0)
    """
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
            "date":  date.today(),  # Always stored as today's date
            "code":  risk_code,
            "label": risk_label,
            "prob":  risk_prob,
        })


def main():
    """
    Main pipeline entry point. Runs the full IoT predict-and-store sequence:
      1. Ensure the predictions table and UNIQUE constraint exist
      2. Load the latest sensor readings from iot_sensor_readings
      3. Build the model feature vector from the sensor values
      4. Load the trained model and run inference
      5. Store the prediction in the database
      6. Print a JSON_RESULT line for the FastAPI route to parse from stdout
      7. Print a warning if the risk level is High or Extreme
    """
    print("IoT Sensor Risk Prediction")
    print("=" * 40)

    engine = create_engine(DATABASE_URL)

    # Ensure the predictions table and UNIQUE constraint exist before any reads or writes
    with engine.begin() as conn:
        conn.execute(text(CREATE_PRED_TABLE))
        conn.execute(text(FIX_CONSTRAINT))

    print("Loading latest IoT sensor readings")
    sensor_data = load_latest_iot(engine)

    if not sensor_data:
        # Table exists but has no rows — device has never successfully sent data
        print("ERROR: No IoT sensor readings found in iot_sensor_readings table.")
        sys.exit(1)  # Exit code 1 signals failure to the calling FastAPI route

    print(f"Raw sensor data: {sensor_data}")

    # Convert raw sensor readings to the feature vector the model expects
    df = build_features(sensor_data)
    if df is None:
        sys.exit(1)  # build_features already printed the specific error message

    # Print each feature value so the log shows exactly what the model received
    print("\nFeature vector:")
    for col in FEATURES:
        print(f"  {col:25s}: {df[col].values[0]:.2f}")

    # Load the trained model and run inference on the single-row feature DataFrame
    model = joblib.load(MODEL_PATH)
    pred  = int(model.predict(df[FEATURES])[0])

    # predict_proba returns probabilities for all classes — take the max as confidence score
    proba = float(model.predict_proba(df[FEATURES]).max()) if hasattr(model, "predict_proba") else 0.0
    label = code_to_label(pred)

    print(f"\nResult: {label} (code {pred}, confidence {proba:.2%})")

    # Store the prediction — separate from weather forecast due to different model_name
    store_prediction(engine, pred, label, proba)
    print("Stored in fire_risk_predictions with model_name=xgboost_iot")

    # Structured result dict printed as a JSON_RESULT line so the FastAPI ml_predict_iot
    # route can parse it from stdout without needing to parse unstructured log output
    result = {
        "ok":               True,
        "source":           "iot_sensors",         # Distinguishes from weather-based predictions
        "risk_code":        pred,
        "risk_label":       label,
        "risk_probability": round(proba, 4),
        "date":             str(date.today()),
        "sensor_data":      sensor_data,            # Raw readings included for debugging
        "features_used":    {col: round(float(df[col].values[0]), 2) for col in FEATURES},
    }
    print("\nJSON_RESULT:" + json.dumps(result))

    # Print a plain-text warning if the prediction requires an alert
    # The actual alert email is triggered by the FastAPI route after parsing JSON_RESULT
    if pred >= 2:
        print(f"\nWARNING: {label} risk detected from IoT sensors — auto-alert will trigger.")


if __name__ == "__main__":
    main()