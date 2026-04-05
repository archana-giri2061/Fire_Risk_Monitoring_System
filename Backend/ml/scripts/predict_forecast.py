"""
predict_forecast.py
===================
Loads 7-day forecast from DB, predicts fire risk, stores results.
Exits with code 1 on any real failure so the Node route detects it.
"""
import sys
import joblib
import pandas as pd
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
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (latitude, longitude, date, model_name)
);
"""


def load_forecast(engine) -> pd.DataFrame:
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

    mask = df["temp_mean"].isna()
    df.loc[mask, "temp_mean"] = (df.loc[mask, "temp_max"] + df.loc[mask, "temp_min"]) / 2.0
    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce").fillna(0)
    df["wind_speed_max"]    = pd.to_numeric(df["wind_speed_max"],    errors="coerce").fillna(0)
    df = df.dropna(subset=FEATURES)
    return df


def load_archive_as_fallback(engine) -> pd.DataFrame:
    """Use recent archive weather if forecast table is empty."""
    print(" Forecast table empty — falling back to archive weather for prediction…")
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
        # Last resort: query without lat filter
        q2 = text("""
            SELECT date,
                   :lat  AS latitude,
                   :lon  AS longitude,
                   temp_max, temp_min, temp_mean,
                   humidity_mean, precipitation_sum, wind_speed_max
            FROM daily_weather
            ORDER BY date DESC LIMIT 7
        """)
        df = pd.read_sql(q2, engine, params={"lat": LATITUDE, "lon": LONGITUDE})

    df["date"] = pd.to_datetime(df["date"]).dt.date
    df["latitude"]  = LATITUDE
    df["longitude"] = LONGITUDE
    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce").fillna(0)
    df["wind_speed_max"]    = pd.to_numeric(df["wind_speed_max"],    errors="coerce").fillna(0)
    mask = df["temp_mean"].isna()
    df.loc[mask, "temp_mean"] = (df.loc[mask, "temp_max"] + df.loc[mask, "temp_min"]) / 2.0
    df = df.dropna(subset=FEATURES)
    return df


def upsert_predictions(engine, out: pd.DataFrame) -> int:
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
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(" Connecting to database …")
    engine = create_engine(DATABASE_URL)

    with engine.begin() as conn:
        conn.execute(text(CREATE_PRED_TABLE))

    print("Loading 7-day forecast …")
    df = load_forecast(engine)

    if df.empty:
        # Try fallback to archive data
        df = load_archive_as_fallback(engine)

    if df.empty:
        print("ERROR: No weather data available in DB.")
        print("Fix: Run POST /api/weather/sync-all first, then retry.")
        sys.exit(1)   # ← exit code 1 so Node route reports the error

    print(f" Using {len(df)} rows for prediction")

    model = joblib.load(MODEL_PATH)
    print(f" Model loaded from: {MODEL_PATH}")

    X    = df[FEATURES]
    pred = model.predict(X)
    proba = model.predict_proba(X).max(axis=1) if hasattr(model, "predict_proba") else [0.0] * len(df)

    out = df[["date", "latitude", "longitude"]].copy()
    out["risk_code"]        = pred
    out["risk_label"]       = out["risk_code"].apply(code_to_label)
    out["risk_probability"] = proba

    print("\n Upcoming Fire Risk Forecast:")
    print(out[["date", "risk_label", "risk_code", "risk_probability"]].to_string(index=False))

    out.to_csv(out_dir / "forecast_predictions.csv", index=False)

    stored = upsert_predictions(engine, out)
    print(f"\n Stored {stored} predictions in database ✅")

    alert_days = out[out["risk_code"].isin({2, 3})]
    if not alert_days.empty:
        print(f"\n ALERT — {len(alert_days)} high-risk day(s) detected:")
        for _, a in alert_days.iterrows():
            print(f"   {a['date']} | {a['risk_label']} | prob={a['risk_probability']:.2f}")
    else:
        print("\n No high-risk days in forecast.")


if __name__ == "__main__":
    main()