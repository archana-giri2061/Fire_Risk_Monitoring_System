import joblib
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, text

from config import DATABASE_URL, MODEL_PATH, FEATURES, LATITUDE, LONGITUDE
from feature_label import code_to_label


CREATE_PRED_TABLE = """
CREATE TABLE IF NOT EXISTS fire_risk_predictions (
  id SERIAL PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  date DATE NOT NULL,
  risk_code INT NOT NULL,
  risk_label TEXT NOT NULL,
  risk_probability DOUBLE PRECISION DEFAULT 0,
  model_name TEXT NOT NULL DEFAULT 'xgboost',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (latitude, longitude, date, model_name)
);
"""


def load_forecast(engine) -> pd.DataFrame:
    q = text("""
        SELECT date, latitude, longitude,
               temp_max, temp_min, temp_mean,
               humidity_mean,
               precipitation_sum, wind_speed_max
        FROM daily_weather_forecast
        WHERE latitude = :lat AND longitude = :lon
        ORDER BY date ASC
    """)
    df = pd.read_sql(q, engine, params={"lat": LATITUDE, "lon": LONGITUDE})
    df["date"] = pd.to_datetime(df["date"]).dt.date

    if df.empty:
        return df

    if "temp_mean" not in df.columns or df["temp_mean"].isna().all():
        df["temp_mean"] = (df["temp_max"] + df["temp_min"]) / 2.0

    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce").fillna(0)
    df["wind_speed_max"] = pd.to_numeric(df["wind_speed_max"], errors="coerce").fillna(0)

    df = df.dropna(subset=FEATURES)
    return df


def upsert_predictions(engine, out):
    sql = text("""
      INSERT INTO fire_risk_predictions
        (latitude, longitude, date, risk_code, risk_label, risk_probability, model_name)
      VALUES
        (:lat, :lon, :date, :code, :label, :prob, 'xgboost')
      ON CONFLICT (latitude, longitude, date, model_name)
      DO UPDATE SET
        risk_code = EXCLUDED.risk_code,
        risk_label = EXCLUDED.risk_label,
        risk_probability = EXCLUDED.risk_probability,
        created_at = NOW()
    """)
    with engine.begin() as conn:
        for _, r in out.iterrows():
            conn.execute(sql, {
                "lat": float(r["latitude"]),
                "lon": float(r["longitude"]),
                "date": r["date"],
                "code": int(r["risk_code"]),
                "label": r["risk_label"],
                "prob": float(r["risk_probability"])
            })


def main():
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    engine = create_engine(DATABASE_URL)
    model = joblib.load(MODEL_PATH)

    with engine.begin() as conn:
        conn.execute(text(CREATE_PRED_TABLE))

    df = load_forecast(engine)

    if df.empty:
        print("❌ No forecast data found.")
        return

    X = df[FEATURES]
    pred = model.predict(X)

    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X).max(axis=1)
    else:
        proba = [0.0] * len(df)

    out = df[["date", "latitude", "longitude"]].copy()
    out["risk_code"] = pred
    out["risk_label"] = out["risk_code"].apply(code_to_label)
    out["risk_probability"] = proba

    print("\n Upcoming Forecast Risk:")
    print(out[["date", "risk_label", "risk_code", "risk_probability"]])

    out.to_csv(out_dir / "forecast_predictions.csv", index=False)
    upsert_predictions(engine, out)

    print("\n Saved forecast predictions to CSV and DB")


if __name__ == "__main__":
    main()