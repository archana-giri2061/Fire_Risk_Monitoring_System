# train_model.py
# Trains an XGBoost wildfire risk classifier on historical Excel weather data.
# Evaluates the model on a held-out validation split and computes cross-validation
# scores and per-class ROC AUC values. Saves the trained model and all metrics
# to disk for use by predict_forecast.py and the ML Analytics frontend page.
#
# Usage (run from Backend/):
#     python ml/scripts/train_model.py
#
# Outputs:
#     ml/models/fire_risk_model_lr.joblib       — saved trained model
#     ml/outputs/metrics_train.json             — accuracy, CV, confusion matrix, ROC AUC
#     ml/outputs/confusion_matrix_train.csv     — confusion matrix as CSV
#     ml/outputs/classification_report_train.csv — per-class precision/recall/F1

import json
import joblib
import numpy  as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics         import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_curve,
    auc,
)
from sklearn.preprocessing import label_binarize
from xgboost               import XGBClassifier

from config        import EXCEL_PATH, MODEL_PATH, FEATURES  # File paths and feature column names
from feature_label import make_risk_label                    # Adds risk_code and risk_score columns


def load_excel_daily(path: str) -> pd.DataFrame:
    """
    Reads the ForestfireData Excel file and returns one aggregated row per day
    with standardised feature column names and a risk_code label column.

    Handles two Excel column naming conventions:
      - Raw DHM station format: "Time (NPT)", "MaximumTemperature", "Humidity", etc.
      - Already-normalised format: "date", "temp_max", "humidity_mean", etc.

    Precipitation and wind columns are optional — they default to 0.0 if absent
    so the function works on Excel files that only contain temperature and humidity.

    After column normalisation, rows are aggregated to daily summaries because
    the source data may contain multiple sub-daily readings per date:
      temp_max          <- max of all readings that day
      temp_min          <- min of all readings that day
      temp_mean         <- mean of all readings that day
      humidity_mean     <- mean of all readings that day
      precipitation_sum <- sum of all readings that day
      wind_speed_max    <- max of all readings that day

    Returns:
        DataFrame with one row per date, all FEATURES columns present,
        and risk_code and risk_score columns added by make_risk_label().
    """
    df = pd.read_excel(path)

    # Detect and normalise the date column name
    date_col   = "Time (NPT)" if "Time (NPT)" in df.columns else "date"
    df["date"] = pd.to_datetime(df[date_col], errors="coerce").dt.date
    df         = df.dropna(subset=["date"])  # Drop rows where date could not be parsed

    # Normalise temperature and humidity column names from DHM station format
    # to the standard names used by all other scripts in the pipeline
    if "MaximumTemperature" in df.columns:
        df["temp_max"]      = pd.to_numeric(df["MaximumTemperature"], errors="coerce")
        df["temp_min"]      = pd.to_numeric(df["MinimumTemperature"], errors="coerce")
        df["temp_mean"]     = (df["temp_max"] + df["temp_min"]) / 2.0
        df["humidity_mean"] = pd.to_numeric(df["Humidity"],           errors="coerce")
    else:
        # Columns are already normalised — just ensure they are numeric
        for col in ["temp_max", "temp_min", "temp_mean", "humidity_mean"]:
            df[col] = pd.to_numeric(df.get(col, 0), errors="coerce")

    # Drop rows missing any core temperature or humidity value — these cannot be labelled
    df = df.dropna(subset=["temp_max", "temp_min", "temp_mean", "humidity_mean"])

    # Find the precipitation column by checking both known naming conventions
    precip_col = next((c for c in ["Precipitation", "precipitation_sum"] if c in df.columns), None)
    df["precipitation_sum"] = (
        pd.to_numeric(df[precip_col], errors="coerce").fillna(0)
        if precip_col else 0.0  # Default to 0 if the column does not exist
    )

    # Find the wind speed column by checking both known naming conventions
    wind_col = next((c for c in ["WindSpeed", "wind_speed_max"] if c in df.columns), None)
    df["wind_speed_max"] = (
        pd.to_numeric(df[wind_col], errors="coerce").fillna(0)
        if wind_col else 0.0  # Default to 0 if the column does not exist
    )

    # Aggregate multiple sub-daily readings into one row per calendar date
    daily = df.groupby("date", as_index=False).agg(
        temp_max          = ("temp_max",          "max"),
        temp_min          = ("temp_min",          "min"),
        temp_mean         = ("temp_mean",         "mean"),
        humidity_mean     = ("humidity_mean",     "mean"),
        precipitation_sum = ("precipitation_sum", "sum"),
        wind_speed_max    = ("wind_speed_max",    "max"),
    )

    # Add risk_code and risk_score columns using the same thresholds as inference scripts
    return make_risk_label(daily)


def main() -> None:
    """
    Main training entry point. Runs the full training sequence:
      1. Load and label the Excel training dataset
      2. Split into 80/20 train/validation sets (stratified by risk class)
      3. Train the XGBoost classifier
      4. Evaluate on the validation set
      5. Run 5-fold stratified cross-validation
      6. Compute per-class ROC AUC scores and macro-average AUC
      7. Save the trained model and all metrics to disk
    """
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading data from: {EXCEL_PATH}")
    df = load_excel_daily(EXCEL_PATH)
    print(f"Daily rows loaded  : {len(df)}")
    print(f"Risk distribution:\n{df['risk_code'].value_counts().sort_index()}")

    # Cannot train a classifier with fewer than 2 distinct classes in the data
    if df["risk_code"].nunique() < 2:
        raise ValueError("Not enough risk classes for classification training.")

    X = df[FEATURES]    # Feature matrix — 6 weather columns
    y = df["risk_code"] # Target labels — 0=Low, 1=Moderate, 2=High, 3=Extreme

    # Stratified split ensures each risk class is proportionally represented
    # in both the training and validation sets
    X_train, X_val, y_train, y_val = train_test_split(
        X, y,
        test_size=0.20,
        random_state=42,  # Fixed seed for reproducibility
        stratify=y,
    )

    # XGBoost multi-class classifier tuned for the 4-class fire risk problem.
    # Key hyperparameter choices:
    #   n_estimators=300     — enough trees for stable predictions without overfitting
    #   max_depth=6          — moderate depth to capture interactions without memorising
    #   learning_rate=0.05   — slow learning rate compensated by more trees
    #   subsample=0.9        — row sampling reduces overfitting
    #   colsample_bytree=0.9 — feature sampling reduces overfitting
    #   min_child_weight=3   — minimum samples per leaf prevents splits on tiny groups
    #   gamma=0.1            — minimum loss reduction required to make a split
    model = XGBClassifier(
        n_estimators      = 300,
        max_depth         = 6,
        learning_rate     = 0.05,
        subsample         = 0.9,
        colsample_bytree  = 0.9,
        min_child_weight  = 3,
        gamma             = 0.1,
        objective         = "multi:softmax",  # Outputs the single most likely class
        num_class         = 4,                # Must match the number of risk levels
        eval_metric       = "mlogloss",       # Multi-class log loss used for early stopping
        random_state      = 42,
    )

    print("\nTraining XGBoost classifier")
    # eval_set allows XGBoost to monitor validation loss during training
    # verbose=False suppresses the per-round log output
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    # Evaluate predictions on the held-out validation set
    y_pred      = model.predict(X_val)
    y_pred_prob = model.predict_proba(X_val)  # Shape: (n_samples, 4) — one probability per class

    acc    = accuracy_score(y_val, y_pred)
    cm     = confusion_matrix(y_val, y_pred)   # 4x4 matrix: rows=actual, cols=predicted
    report = classification_report(
        y_val, y_pred,
        digits=4,
        output_dict=True,  # Dict format so it can be serialised to JSON
    )

    print(f"\nValidation Accuracy: {acc:.4f}  ({acc * 100:.2f}%)")
    print(f"Confusion Matrix:\n{cm}")
    print(f"\n{classification_report(y_val, y_pred, digits=4)}")  # Human-readable for logs

    # 5-fold stratified cross-validation on the full dataset gives a more reliable
    # estimate of generalisation performance than a single train/val split
    cv        = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X, y, cv=cv, scoring="accuracy")
    print(f"5-fold CV accuracy: {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")

    # Compute per-class ROC AUC using a one-vs-rest strategy.
    # label_binarize converts the integer class labels to a binary matrix
    # where column i is 1 if the sample belongs to class i, else 0.
    n_classes  = 4
    y_bin      = label_binarize(y_val, classes=list(range(n_classes)))
    risk_names = ["Low", "Moderate", "High", "Extreme"]
    roc_auc_scores = {}

    for i, name in enumerate(risk_names):
        fpr, tpr, _ = roc_curve(y_bin[:, i], y_pred_prob[:, i])
        roc_auc_scores[name] = float(auc(fpr, tpr))

    # Macro-average AUC: interpolate all per-class TPR curves onto a shared FPR grid,
    # average them, then compute the AUC of the resulting mean curve
    all_fpr = np.unique(np.concatenate([
        roc_curve(y_bin[:, i], y_pred_prob[:, i])[0] for i in range(n_classes)
    ]))
    mean_tpr = np.zeros_like(all_fpr)
    for i in range(n_classes):
        fpr_i, tpr_i, _ = roc_curve(y_bin[:, i], y_pred_prob[:, i])
        mean_tpr += np.interp(all_fpr, fpr_i, tpr_i)  # Interpolate to the shared FPR grid
    mean_tpr  /= n_classes  # Average across all classes
    macro_auc  = float(auc(all_fpr, mean_tpr))
    print(f"Macro AUC: {macro_auc:.4f}")

    # Assemble the full metrics dict read by GET /api/ml/metrics and the frontend
    metrics = {
        "validation_accuracy":   float(acc),
        "cv_accuracy_mean":      float(cv_scores.mean()),
        "cv_accuracy_std":       float(cv_scores.std()),
        "confusion_matrix":      cm.tolist(),        # Convert numpy array to plain list for JSON
        "classification_report": report,
        "features":              FEATURES,
        "model":                 "XGBoost",
        "num_training_samples":  len(df),
        "roc_auc":               roc_auc_scores,     # Per-class AUC scores
        "macro_auc":             macro_auc,
    }

    with open(out_dir / "metrics_train.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    # Save CSV snapshots for manual inspection and audit purposes
    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_train.csv", index=False)
    pd.DataFrame(report).T.to_csv(out_dir / "classification_report_train.csv")

    # Save the trained model — parent directory is created if it does not exist
    Path(MODEL_PATH).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    print(f"\nModel saved   : {MODEL_PATH}")
    print(f"Metrics saved : {out_dir}/metrics_train.json")
    print("Training complete.")


if __name__ == "__main__":
    main()