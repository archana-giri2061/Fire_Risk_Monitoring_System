"""
train_model.py
==============
Trains an XGBoost wildfire risk classifier on historical Excel weather data.

Usage (from Backend/ directory):
    python ml/scripts/train_model.py

Outputs:
    ml/models/fire_risk_model_lr.joblib      — trained model
    ml/outputs/metrics_train.json            — accuracy, CV, confusion matrix, ROC AUC
    ml/outputs/confusion_matrix_train.csv
    ml/outputs/classification_report_train.csv
"""

import json
import joblib
import numpy  as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics         import (
    accuracy_score, classification_report, confusion_matrix,
    roc_curve, auc,
)
from sklearn.preprocessing   import label_binarize
from xgboost                  import XGBClassifier

from config        import EXCEL_PATH, MODEL_PATH, FEATURES
from feature_label import make_risk_label


# ── Data loading ────────────────────────────────────────────────────────────
def load_excel_daily(path: str) -> pd.DataFrame:
    """
    Reads the ForestfireData Excel file and returns one row per day
    with standardised feature columns and a `risk_code` label.
    """
    df = pd.read_excel(path)

    # ── Date column ──
    date_col  = "Time (NPT)" if "Time (NPT)" in df.columns else "date"
    df["date"] = pd.to_datetime(df[date_col], errors="coerce").dt.date
    df         = df.dropna(subset=["date"])

    # ── Temperature & humidity ──
    if "MaximumTemperature" in df.columns:
        df["temp_max"]      = pd.to_numeric(df["MaximumTemperature"], errors="coerce")
        df["temp_min"]      = pd.to_numeric(df["MinimumTemperature"], errors="coerce")
        df["temp_mean"]     = (df["temp_max"] + df["temp_min"]) / 2.0
        df["humidity_mean"] = pd.to_numeric(df["Humidity"], errors="coerce")
    else:
        for col in ["temp_max", "temp_min", "temp_mean", "humidity_mean"]:
            df[col] = pd.to_numeric(df.get(col, 0), errors="coerce")

    df = df.dropna(subset=["temp_max", "temp_min", "temp_mean", "humidity_mean"])

    # ── Precipitation & wind (optional columns) ──
    precip_col = next((c for c in ["Precipitation", "precipitation_sum"] if c in df.columns), None)
    df["precipitation_sum"] = (
        pd.to_numeric(df[precip_col], errors="coerce").fillna(0)
        if precip_col else 0.0
    )

    wind_col = next((c for c in ["WindSpeed", "wind_speed_max"] if c in df.columns), None)
    df["wind_speed_max"] = (
        pd.to_numeric(df[wind_col], errors="coerce").fillna(0)
        if wind_col else 0.0
    )

    # ── Aggregate to one row per day ──
    daily = df.groupby("date", as_index=False).agg(
        temp_max          = ("temp_max",          "max"),
        temp_min          = ("temp_min",          "min"),
        temp_mean         = ("temp_mean",         "mean"),
        humidity_mean     = ("humidity_mean",     "mean"),
        precipitation_sum = ("precipitation_sum", "sum"),
        wind_speed_max    = ("wind_speed_max",    "max"),
    )

    return make_risk_label(daily)


# ── Training ────────────────────────────────────────────────────────────────
def main() -> None:
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Load data ──
    print(f"📂 Loading data from: {EXCEL_PATH}")
    df = load_excel_daily(EXCEL_PATH)
    print(f"   Daily rows  : {len(df)}")
    print(f"   Risk distribution:\n{df['risk_code'].value_counts().sort_index()}")

    if df["risk_code"].nunique() < 2:
        raise ValueError("Not enough risk classes for classification training.")

    X = df[FEATURES]
    y = df["risk_code"]

    # ── Train / validation split (80/20, stratified) ──
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y,
    )

    # ── Model definition ──
    model = XGBClassifier(
        n_estimators      = 300,
        max_depth         = 6,
        learning_rate     = 0.05,
        subsample         = 0.9,
        colsample_bytree  = 0.9,
        min_child_weight  = 3,
        gamma             = 0.1,
        objective         = "multi:softmax",
        num_class         = 4,
        eval_metric       = "mlogloss",
        random_state      = 42,
    )

    # ── Train ──
    print("\n🤖 Training XGBoost …")
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    # ── Evaluate ──
    y_pred      = model.predict(X_val)
    y_pred_prob = model.predict_proba(X_val)

    acc    = accuracy_score(y_val, y_pred)
    cm     = confusion_matrix(y_val, y_pred)
    report = classification_report(y_val, y_pred, digits=4, output_dict=True)

    print(f"\n✅ Validation Accuracy : {acc:.4f}  ({acc*100:.2f}%)")
    print(f"   Confusion Matrix:\n{cm}")
    print(f"\n{classification_report(y_val, y_pred, digits=4)}")

    # ── Cross-validation ──
    cv        = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X, y, cv=cv, scoring="accuracy")
    print(f"   5-fold CV : {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # ── ROC AUC (one-vs-rest) ──
    n_classes  = 4
    y_bin      = label_binarize(y_val, classes=list(range(n_classes)))
    risk_names = ["Low", "Moderate", "High", "Extreme"]
    roc_auc_scores = {}
    for i, name in enumerate(risk_names):
        fpr, tpr, _ = roc_curve(y_bin[:, i], y_pred_prob[:, i])
        roc_auc_scores[name] = float(auc(fpr, tpr))

    # Macro-average AUC
    all_fpr  = np.unique(np.concatenate([
        roc_curve(y_bin[:, i], y_pred_prob[:, i])[0] for i in range(n_classes)
    ]))
    mean_tpr = np.zeros_like(all_fpr)
    for i in range(n_classes):
        fpr_i, tpr_i, _ = roc_curve(y_bin[:, i], y_pred_prob[:, i])
        mean_tpr += np.interp(all_fpr, fpr_i, tpr_i)
    mean_tpr /= n_classes
    macro_auc = float(auc(all_fpr, mean_tpr))
    print(f"   Macro AUC : {macro_auc:.4f}")

    # ── Save metrics ──
    metrics = {
        "validation_accuracy":   float(acc),
        "cv_accuracy_mean":      float(cv_scores.mean()),
        "cv_accuracy_std":       float(cv_scores.std()),
        "confusion_matrix":      cm.tolist(),
        "classification_report": report,
        "features":              FEATURES,
        "model":                 "XGBoost",
        "num_training_samples":  len(df),
        "roc_auc":               roc_auc_scores,
        "macro_auc":             macro_auc,
    }

    with open(out_dir / "metrics_train.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_train.csv", index=False)
    pd.DataFrame(report).T.to_csv(out_dir / "classification_report_train.csv")

    # ── Save model ──
    Path(MODEL_PATH).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    print(f"\n💾 Model saved   → {MODEL_PATH}")
    print(f"   Metrics saved → {out_dir}/metrics_train.json")
    print("🎉 Training complete!")


if __name__ == "__main__":
    main()