"""
test_with_archive.py
====================
Evaluates the trained model against DB-stored historical archive data.
"""

import json
import joblib
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, text
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from config import DATABASE_URL, MODEL_PATH, FEATURES, LOCATION_KEY
from feature_label import make_risk_label


def load_archive(engine) -> pd.DataFrame:
    q = text("""
        SELECT date,
               temp_max, temp_min, temp_mean,
               humidity_mean, precipitation_sum, wind_speed_max
        FROM daily_weather
        WHERE location_key = :lk
          AND data_source   = 'archive'
        ORDER BY date ASC
    """)
    df = pd.read_sql(q, engine, params={"lk": LOCATION_KEY})
    df["date"] = pd.to_datetime(df["date"]).dt.date

    if df.empty:
        return df

    if df["temp_mean"].isna().all():
        df["temp_mean"] = (df["temp_max"] + df["temp_min"]) / 2.0

    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce").fillna(0)
    df["wind_speed_max"]    = pd.to_numeric(df["wind_speed_max"],    errors="coerce").fillna(0)

    df = df.dropna(subset=FEATURES)
    df = make_risk_label(df)
    return df


def main():
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(" Connecting to database …")
    engine = create_engine(DATABASE_URL)

    print(" Loading archive data …")
    df = load_archive(engine)

    if df.empty:
        print(" No archive data found. Run weather sync first.")
        return

    print(f" Archive rows: {len(df)}")
    print("   Risk distribution:\n", df["risk_code"].value_counts().sort_index())

    model = joblib.load(MODEL_PATH)
    print(f" Model loaded from: {MODEL_PATH}")

    X    = df[FEATURES]
    y    = df["risk_code"]
    pred = model.predict(X)

    acc    = accuracy_score(y, pred)
    cm     = confusion_matrix(y, pred)
    report = classification_report(y, pred, digits=4, output_dict=True)

    print(f"\n Archive Test Accuracy : {acc:.4f}")
    print("   Confusion Matrix:\n", cm)
    print("\n", classification_report(y, pred, digits=4))

    metrics = {
        "archive_accuracy":       float(acc),
        "num_archive_samples":    len(df),
        "confusion_matrix":       cm.tolist(),
        "classification_report":  report,
        "features":               FEATURES,
        "model":                  "XGBoost",
    }

    with open(out_dir / "metrics_archive.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_archive.csv", index=False)
    pd.DataFrame(report).transpose().to_csv(out_dir / "classification_report_archive.csv")

    print("\n Archive evaluation saved to ml/outputs/")


if __name__ == "__main__":
    main()