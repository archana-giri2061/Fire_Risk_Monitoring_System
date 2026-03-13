import json
import joblib
import pandas as pd
from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from xgboost import XGBClassifier

from config import EXCEL_PATH, MODEL_PATH, FEATURES
from feature_label import make_risk_label


def load_excel_daily(path: str) -> pd.DataFrame:
    df = pd.read_excel(path)

    df["date"] = pd.to_datetime(df["Time (NPT)"], errors="coerce").dt.date
    df = df.dropna(subset=["date", "MaximumTemperature", "MinimumTemperature", "Humidity"])

    df["temp_max"] = df["MaximumTemperature"].astype(float)
    df["temp_min"] = df["MinimumTemperature"].astype(float)
    df["temp_mean"] = (df["temp_max"] + df["temp_min"]) / 2.0
    df["humidity_mean"] = df["Humidity"].astype(float)

    if "Precipitation" in df.columns:
        df["precipitation_sum"] = pd.to_numeric(df["Precipitation"], errors="coerce").fillna(0)
    else:
        df["precipitation_sum"] = 0.0

    if "WindSpeed" in df.columns:
        df["wind_speed_max"] = pd.to_numeric(df["WindSpeed"], errors="coerce").fillna(0)
    else:
        df["wind_speed_max"] = 0.0

    daily = df.groupby("date", as_index=False).agg(
        temp_max=("temp_max", "max"),
        temp_min=("temp_min", "min"),
        temp_mean=("temp_mean", "mean"),
        humidity_mean=("humidity_mean", "mean"),
        precipitation_sum=("precipitation_sum", "sum"),
        wind_speed_max=("wind_speed_max", "max"),
    )

    daily = make_risk_label(daily)
    return daily


def main():
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    train_df = load_excel_daily(EXCEL_PATH)
    print("✅ Excel daily rows:", len(train_df))

    X = train_df[FEATURES]
    y = train_df["risk_code"]

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="multi:softmax",
        num_class=len(sorted(y.unique())),
        random_state=42
    )

    model.fit(X_train, y_train)

    pred = model.predict(X_val)

    acc = accuracy_score(y_val, pred)
    cm = confusion_matrix(y_val, pred)
    report_dict = classification_report(y_val, pred, digits=4, output_dict=True)

    print("\n✅ Validation Accuracy:", acc)
    print("Confusion Matrix:\n", cm)
    print("\nReport:\n", classification_report(y_val, pred, digits=4))

    metrics = {
        "validation_accuracy": float(acc),
        "confusion_matrix": cm.tolist(),
        "classification_report": report_dict,
        "model": "XGBoost"
    }

    with open(out_dir / "metrics_train.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_train.csv", index=False)
    pd.DataFrame(report_dict).transpose().to_csv(out_dir / "classification_report_train.csv", index=True)

    Path(MODEL_PATH).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    print("\n✅ Saved model to:", MODEL_PATH)


if __name__ == "__main__":
    main()