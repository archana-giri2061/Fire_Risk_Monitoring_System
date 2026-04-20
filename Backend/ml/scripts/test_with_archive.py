# test_with_archive.py
# Evaluates the trained fire risk model against historical archive weather data
# stored in the daily_weather table. Computes accuracy, confusion matrix, and
# per-class precision/recall/F1 scores, then saves them to ml/outputs/ for the
# ML Analytics page to display via GET /api/ml/metrics.
#
# Usage (run from Backend/):
#     python ml/scripts/test_with_archive.py

import json
import joblib
import pandas as pd
from pathlib import Path
from sqlalchemy import create_engine, text
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from config import DATABASE_URL, MODEL_PATH, FEATURES, LOCATION_KEY
from feature_label import make_risk_label  # Computes risk_score and risk_code from weather features


def load_archive(engine) -> pd.DataFrame:
    """
    Loads all historical archive weather records for the configured location
    from the daily_weather table and prepares them for model evaluation.

    Post-processing applied:
      - date column converted to Python date objects
      - temp_mean derived from (temp_max + temp_min) / 2 if all values are null
      - precipitation_sum and wind_speed_max coerced to numeric with nulls filled to 0
      - Rows with any remaining null in FEATURES columns are dropped
      - risk_code and risk_score columns added by make_risk_label() so each row
        has a ground-truth label to compare against the model's predictions

    Returns:
        DataFrame ready for evaluation, or empty DataFrame if no archive data exists.
    """
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

    # If every temp_mean value is null (e.g. older archive data from Open-Meteo
    # that did not include the mean field), derive it from max and min
    if df["temp_mean"].isna().all():
        df["temp_mean"] = (df["temp_max"] + df["temp_min"]) / 2.0

    # Coerce to numeric and replace nulls with 0 so no feature column contains NaN
    df["precipitation_sum"] = pd.to_numeric(df["precipitation_sum"], errors="coerce").fillna(0)
    df["wind_speed_max"]    = pd.to_numeric(df["wind_speed_max"],    errors="coerce").fillna(0)

    # Drop rows that still have nulls in any required feature column after filling
    df = df.dropna(subset=FEATURES)

    # Add ground-truth risk_code column using the same scoring logic as training
    # so the evaluation reflects real-world label boundaries, not arbitrary splits
    df = make_risk_label(df)
    return df


def main():
    """
    Main evaluation entry point. Runs the full archive evaluation sequence:
      1. Load and label historical archive data from the database
      2. Load the trained model from disk
      3. Run predictions on the archive feature columns
      4. Compute accuracy, confusion matrix, and classification report
      5. Save all metrics to ml/outputs/ as JSON and CSV files
    """
    # Ensure the output directory exists before trying to write files
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Connecting to database")
    engine = create_engine(DATABASE_URL)

    print("Loading archive data")
    df = load_archive(engine)

    if df.empty:
        # Cannot evaluate without data — prompt the user to run weather sync first
        print("No archive data found. Run POST /api/weather/sync-all first.")
        return

    print(f"Archive rows loaded: {len(df)}")
    print("Risk distribution:\n", df["risk_code"].value_counts().sort_index())

    # Load the trained model saved by train_model.py
    model = joblib.load(MODEL_PATH)
    print(f"Model loaded from: {MODEL_PATH}")

    X    = df[FEATURES]   # Feature matrix — same columns used during training
    y    = df["risk_code"] # Ground-truth labels computed by make_risk_label()
    pred = model.predict(X)

    # Compute evaluation metrics
    acc    = accuracy_score(y, pred)
    cm     = confusion_matrix(y, pred)   # 4x4 matrix: rows=actual, cols=predicted
    report = classification_report(
        y, pred,
        digits=4,
        output_dict=True,  # Returns a dict so it can be serialised to JSON
    )

    print(f"\nArchive Test Accuracy: {acc:.4f}")
    print("Confusion Matrix:\n", cm)
    print("\n", classification_report(y, pred, digits=4))  # Human-readable version for logs

    # Assemble the metrics dict that will be read by GET /api/ml/metrics
    metrics = {
        "archive_accuracy":      float(acc),
        "num_archive_samples":   len(df),
        "confusion_matrix":      cm.tolist(),       # Convert numpy array to plain list for JSON
        "classification_report": report,
        "features":              FEATURES,
        "model":                 "XGBoost",
    }

    # Save metrics as JSON for the ML Analytics frontend page
    with open(out_dir / "metrics_archive.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    # Save CSV snapshots for manual inspection and audit purposes
    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_archive.csv", index=False)
    pd.DataFrame(report).transpose().to_csv(out_dir / "classification_report_archive.csv")

    print("\nArchive evaluation saved to ml/outputs/")


if __name__ == "__main__":
    main()