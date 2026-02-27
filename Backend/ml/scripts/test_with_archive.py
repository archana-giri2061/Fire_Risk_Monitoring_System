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
               humidity_mean,
               precipitation_sum, wind_speed_max
        FROM daily_weather
        WHERE location_key = :lk AND data_source = 'archive'
        ORDER BY date ASC
    """)
    df = pd.read_sql(q, engine, params={"lk": LOCATION_KEY})
    df["date"] = pd.to_datetime(df["date"]).dt.date

    if "temp_mean" not in df.columns or df["temp_mean"].isna().all():
        df["temp_mean"] = (df["temp_max"] + df["temp_min"]) / 2.0

    df = df.dropna(subset=FEATURES)
    df = make_risk_label(df)
    return df


def main():
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    engine = create_engine(DATABASE_URL)
    model = joblib.load(MODEL_PATH)

    df = load_archive(engine)

    if df.empty:
        print("❌ No archive data found.")
        return

    X = df[FEATURES]
    y = df["risk_code"]

    pred = model.predict(X)

    acc = accuracy_score(y, pred)
    cm = confusion_matrix(y, pred)
    report_dict = classification_report(y, pred, digits=4, output_dict=True)

    print("\n✅ Archive Test Accuracy:", acc)
    print("Confusion Matrix:\n", cm)
    print("\nReport:\n", classification_report(y, pred, digits=4))

    # ✅ Save outputs
    metrics = {
        "archive_accuracy": float(acc),
        "confusion_matrix": cm.tolist(),
        "classification_report": report_dict
    }

    with open(out_dir / "metrics_archive.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_archive.csv", index=False)
    pd.DataFrame(report_dict).transpose().to_csv(out_dir / "classification_report_archive.csv")

    print("\n✅ Saved:")
    print(" - ml/outputs/metrics_archive.json")
    print(" - ml/outputs/confusion_matrix_archive.csv")
    print(" - ml/outputs/classification_report_archive.csv")


if __name__ == "__main__":
    main()