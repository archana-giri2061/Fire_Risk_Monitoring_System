"""
train_model.py
==============
Trains XGBoost wildfire risk classifier on historical Excel data.
"""

import json
import joblib
import pandas as pd
from pathlib import Path

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from xgboost import XGBClassifier

from config import EXCEL_PATH, MODEL_PATH, FEATURES
from feature_label import make_risk_label


def load_excel_daily(path: str) -> pd.DataFrame:
    df = pd.read_excel(path)

    date_col = "Time (NPT)" if "Time (NPT)" in df.columns else "date"
    df["date"] = pd.to_datetime(df[date_col], errors="coerce").dt.date
    df = df.dropna(subset=["date"])

    if "MaximumTemperature" in df.columns:
        df["temp_max"]      = pd.to_numeric(df["MaximumTemperature"], errors="coerce")
        df["temp_min"]      = pd.to_numeric(df["MinimumTemperature"], errors="coerce")
        df["temp_mean"]     = (df["temp_max"] + df["temp_min"]) / 2.0
        df["humidity_mean"] = pd.to_numeric(df["Humidity"],           errors="coerce")
    else:
        for col in ["temp_max", "temp_min", "temp_mean", "humidity_mean"]:
            df[col] = pd.to_numeric(df.get(col, 0), errors="coerce")

    df = df.dropna(subset=["temp_max", "temp_min", "temp_mean", "humidity_mean"])

    precip_col = next((c for c in ["Precipitation", "precipitation_sum"] if c in df.columns), None)
    df["precipitation_sum"] = (
        pd.to_numeric(df[precip_col], errors="coerce").fillna(0) if precip_col else 0.0
    )

    wind_col = next((c for c in ["WindSpeed", "wind_speed_max"] if c in df.columns), None)
    df["wind_speed_max"] = (
        pd.to_numeric(df[wind_col], errors="coerce").fillna(0) if wind_col else 0.0
    )

    daily = df.groupby("date", as_index=False).agg(
        temp_max          = ("temp_max",          "max"),
        temp_min          = ("temp_min",          "min"),
        temp_mean         = ("temp_mean",         "mean"),
        humidity_mean     = ("humidity_mean",     "mean"),
        precipitation_sum = ("precipitation_sum", "sum"),
        wind_speed_max    = ("wind_speed_max",    "max"),
    )

    daily = make_risk_label(daily)
    return daily


def main():
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f" Loading training data from: {EXCEL_PATH}")
    df = load_excel_daily(EXCEL_PATH)
    print(f" Daily rows loaded: {len(df)}")
    print("  Risk distribution:\n", df["risk_code"].value_counts().sort_index())

    if df["risk_code"].nunique() < 2:
        raise ValueError("Not enough risk classes for training.")

    X = df[FEATURES]
    y = df["risk_code"]

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # NOTE: use_label_encoder was removed in XGBoost 2.0 — do NOT include it
    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=3,
        gamma=0.1,
        objective="multi:softmax",
        num_class=4,
        eval_metric="mlogloss",
        random_state=42,
    )

    print("\n Training model …")
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    pred   = model.predict(X_val)
    acc    = accuracy_score(y_val, pred)
    cm     = confusion_matrix(y_val, pred)
    report = classification_report(y_val, pred, digits=4, output_dict=True)

    print(f"\n Validation Accuracy : {acc:.4f}")
    print("  Confusion Matrix:\n", cm)
    print("\n", classification_report(y_val, pred, digits=4))

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X, y, cv=cv, scoring="accuracy")
    print(f"  5-fold CV accuracy : {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    metrics = {
        "validation_accuracy":   float(acc),
        "cv_accuracy_mean":      float(cv_scores.mean()),
        "cv_accuracy_std":       float(cv_scores.std()),
        "confusion_matrix":      cm.tolist(),
        "classification_report": report,
        "features":              FEATURES,
        "model":                 "XGBoost",
        "num_training_samples":  len(df),
    }

    with open(out_dir / "metrics_train.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_train.csv", index=False)
    pd.DataFrame(report).transpose().to_csv(out_dir / "classification_report_train.csv")

    Path(MODEL_PATH).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"\n Model saved to: {MODEL_PATH}")
    print(" Training complete!")


if __name__ == "__main__":
    main()