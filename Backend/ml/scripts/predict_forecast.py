# predict_forecast.py
# Loads the 7-day weather forecast from the database, runs it through the
# trained fire risk model, and stores the predictions back into the database.
# Also prints a summary of any high-risk days found.
# Exits with code 1 on any real failure so the calling Node/FastAPI route
# can detect the failure and return an appropriate error response.

import sys
import joblib
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, text

from config import DATABASE_URL, MODEL_PATH, FEATURES, LATITUDE, LONGITUDE
from feature_label import code_to_label  # Converts integer risk codes to label strings


# DDL to create the predictions table if it does not already exist.
# Runs on every execution so the script is safe to run before the table exists.
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

# Adds a UNIQUE constraint on (latitude, longitude, date, model_name) if it does
# not already exist. Wrapped in a DO block so it is safe to run multiple times
# without failing on tables that were created before this constraint was added.
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


def load_forecast(engine) -> pd.DataFrame:
    """
    Reads the next 7 days of forecast weather data from daily_weather_forecast
    for the configured location coordinates.

    Post-processing applied:
      - date column converted from string to Python date objects
      - temp_mean derived from (temp_max + temp_min) / 2 where it is null
      - precipitation_sum and wind_speed_max coerced to numeric and nulls filled with 0
      - Rows with any remaining null in the FEATURES columns are dropped

    Returns:
        DataFrame with 7 or fewer rows ready for model inference,
        or an empty DataFrame if the forecast table has no data yet.
    """
    q = text("""
        SELECT date, latitude, longitude,
               temp_max, temp_min, temp_mean,
               humidity_mean, precipitation_sum, wind_speed_max
        FROM daily_weather_forecast
        WHERE latitude  = :lat
          AND longitude = :lon
        ORDER BY date ASC
        LIMIT 7
    """)
    df = pd.read_sql(q, engine, params={"lat": LATITUDE, "lon": LONGITUDE})
    df["date"] = pd.to_datetime(df["date"]).dt.date

    if df.empty:
        return df

    # Fill missing temp_mean using the average of max and min for that day
    mask = df["temp_mean"].isna()
    df.loc[mask, "temp_mean"] = (df.loc[mask, "temp_max"] + df.loc[mask, "temp_min"]) / 2.0

    # Coerce to numeric and replace any remaining nulls with 0
    # so the model receives clean float values for every row
    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce").fillna(0)
    df["wind_speed_max"]    = pd.to_numeric(df["wind_speed_max"],    errors="coerce").fillna(0)

    # Drop any rows that still have nulls in required feature columns
    df = df.dropna(subset=FEATURES)
    return df


def load_archive_as_fallback(engine) -> pd.DataFrame:
    """
    Falls back to the most recent 7 days of historical archive data when the
    forecast table is empty. This allows predictions to still be generated
    even if the weather sync has not run yet or the forecast API was unavailable.

    Tries two queries in sequence:
      1. Filter by latitude to get data for the correct location
      2. If that returns nothing, fetch the 7 most recent rows with no location filter

    Returns:
        DataFrame with up to 7 rows, or empty if the archive table is also empty.
    """
    print("Forecast table empty — falling back to archive weather for prediction")

    q = text("""
        SELECT date,
               COALESCE(latitude,  :lat) AS latitude,
               COALESCE(longitude, :lon) AS longitude,
               temp_max, temp_min, temp_mean,
               humidity_mean, precipitation_sum, wind_speed_max
        FROM daily_weather
        WHERE latitude  IS NOT DISTINCT FROM :lat
           OR location_key IS NOT NULL
        ORDER BY date DESC
        LIMIT 7
    """)
    df = pd.read_sql(q, engine, params={"lat": LATITUDE, "lon": LONGITUDE})

    if df.empty:
        # Last resort: fetch any 7 rows ignoring location filter entirely
        q2 = text("""
            SELECT date,
                   :lat AS latitude,
                   :lon AS longitude,
                   temp_max, temp_min, temp_mean,
                   humidity_mean, precipitation_sum, wind_speed_max
            FROM daily_weather
            ORDER BY date DESC LIMIT 7
        """)
        df = pd.read_sql(q2, engine, params={"lat": LATITUDE, "lon": LONGITUDE})

    df["date"]      = pd.to_datetime(df["date"]).dt.date
    df["latitude"]  = LATITUDE   # Normalise to configured coordinates regardless of what the DB returned
    df["longitude"] = LONGITUDE

    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce").fillna(0)
    df["wind_speed_max"]    = pd.to_numeric(df["wind_speed_max"],    errors="coerce").fillna(0)

    # Fill missing temp_mean from max/min average
    mask = df["temp_mean"].isna()
    df.loc[mask, "temp_mean"] = (df.loc[mask, "temp_max"] + df.loc[mask, "temp_min"]) / 2.0

    df = df.dropna(subset=FEATURES)
    return df


def upsert_predictions(engine, out: pd.DataFrame) -> int:
    """
    Writes prediction rows into fire_risk_predictions using an upsert so that
    re-running the script updates existing predictions rather than creating duplicates.
    The UNIQUE constraint on (latitude, longitude, date, model_name) determines
    which rows are treated as duplicates.

    Parameters:
        engine : SQLAlchemy engine connected to the database
        out    : DataFrame with columns: date, latitude, longitude,
                 risk_code, risk_label, risk_probability

    Returns:
        Number of rows written (equal to len(out))
    """
    sql = text("""
        INSERT INTO fire_risk_predictions
          (latitude, longitude, date, risk_code, risk_label, risk_probability, model_name)
        VALUES (:lat, :lon, :date, :code, :label, :prob, 'xgboost')
        ON CONFLICT (latitude, longitude, date, model_name)
        DO UPDATE SET
          risk_code        = EXCLUDED.risk_code,
          risk_label       = EXCLUDED.risk_label,
          risk_probability = EXCLUDED.risk_probability,
          created_at       = NOW()
    """)
    with engine.begin() as conn:
        for _, r in out.iterrows():
            conn.execute(sql, {
                "lat":   float(r["latitude"]),
                "lon":   float(r["longitude"]),
                "date":  r["date"],
                "code":  int(r["risk_code"]),
                "label": r["risk_label"],
                "prob":  float(r["risk_probability"]),
            })
    return len(out)


def main():
    """
    Main pipeline entry point. Runs the full predict-and-store sequence:
      1. Ensure the predictions table and UNIQUE constraint exist
      2. Load forecast weather data (fall back to archive if forecast is empty)
      3. Load the trained model from disk
      4. Run inference on the weather features
      5. Store predictions in the database via upsert
      6. Print a summary of any high-risk days detected
    """
    # Ensure the outputs directory exists for saving the CSV snapshot
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Connecting to database")
    engine = create_engine(DATABASE_URL)

    # Ensure the predictions table and UNIQUE constraint exist before any reads or writes
    with engine.begin() as conn:
        conn.execute(text(CREATE_PRED_TABLE))
        conn.execute(text(FIX_CONSTRAINT))
    print("Table ready with UNIQUE constraint")

    print("Loading 7-day forecast")
    df = load_forecast(engine)

    if df.empty:
        df = load_archive_as_fallback(engine)

    if df.empty:
        # Neither forecast nor archive has data — cannot proceed
        print("ERROR: No weather data available in DB.")
        print("Fix: Run POST /api/weather/sync-all first, then retry.")
        sys.exit(1)  # Exit code 1 signals failure to the calling Node/FastAPI route

    print(f"Using {len(df)} rows for prediction")

    # Load the trained model saved by train_model.py
    model = joblib.load(MODEL_PATH)
    print(f"Model loaded from: {MODEL_PATH}")

    # Run the model on the feature columns only
    X     = df[FEATURES]
    pred  = model.predict(X)

    # predict_proba gives the confidence score for the predicted class.
    # max(axis=1) takes the highest probability across all classes for each row.
    # Falls back to 0.0 for model types that do not support probability output.
    proba = model.predict_proba(X).max(axis=1) if hasattr(model, "predict_proba") else [0.0] * len(df)

    # Assemble the output DataFrame with predictions alongside location and date
    out = df[["date", "latitude", "longitude"]].copy()
    out["risk_code"]        = pred
    out["risk_label"]       = out["risk_code"].apply(code_to_label)
    out["risk_probability"] = proba

    print("\nUpcoming Fire Risk Forecast:")
    print(out[["date", "risk_label", "risk_code", "risk_probability"]].to_string(index=False))

    # Save a CSV snapshot of this run for debugging and audit purposes
    out.to_csv(out_dir / "forecast_predictions.csv", index=False)

    stored = upsert_predictions(engine, out)
    print(f"\nStored {stored} predictions in database")

    # Print a summary of any days that require an alert (High=2, Extreme=3)
    alert_days = out[out["risk_code"].isin({2, 3})]
    if not alert_days.empty:
        print(f"\nALERT — {len(alert_days)} high-risk day(s) detected:")
        for _, a in alert_days.iterrows():
            print(f"  {a['date']} | {a['risk_label']} | prob={a['risk_probability']:.2f}")
    else:
        print("\nNo high-risk days in forecast.")


if __name__ == "__main__":
    main()