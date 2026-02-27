import json
import joblib
import pandas as pd
from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from config import EXCEL_PATH, MODEL_PATH, FEATURES
from feature_label import make_risk_label


def load_excel_daily(path: str) -> pd.DataFrame:
    df = pd.read_excel(path)

    # Required columns from your sheet:
    # Time (NPT), MaximumTemperature, MinimumTemperature, Humidity
    df["date"] = pd.to_datetime(df["Time (NPT)"], errors="coerce").dt.date
    df = df.dropna(subset=["date", "MaximumTemperature", "MinimumTemperature", "Humidity"])

    df["temp_max"] = df["MaximumTemperature"].astype(float)
    df["temp_min"] = df["MinimumTemperature"].astype(float)
    df["temp_mean"] = (df["temp_max"] + df["temp_min"]) / 2.0
    df["humidity_mean"] = df["Humidity"].astype(float)

    # Daily aggregate
    daily = df.groupby("date", as_index=False).agg(
        temp_max=("temp_max", "max"),
        temp_min=("temp_min", "min"),
        temp_mean=("temp_mean", "mean"),
        humidity_mean=("humidity_mean", "mean"),
    )

    daily = make_risk_label(daily)
    return daily


def main():
    # ✅ output folder
    out_dir = Path("ml/outputs")
    out_dir.mkdir(parents=True, exist_ok=True)

    train_df = load_excel_daily(EXCEL_PATH)
    print("✅ Excel daily rows:", len(train_df))

    X = train_df[FEATURES]
    y = train_df["risk_code"]

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=2000))
    ])

    model.fit(X_train, y_train)

    pred = model.predict(X_val)

    # ✅ metrics
    acc = accuracy_score(y_val, pred)
    cm = confusion_matrix(y_val, pred)

    # ✅ report as dict (easy to save to json)
    report_dict = classification_report(y_val, pred, digits=4, output_dict=True)

    print("\n✅ Validation Accuracy:", acc)
    print("Confusion Matrix:\n", cm)
    print("\nReport:\n", classification_report(y_val, pred, digits=4))

    # ✅ save metrics JSON
    metrics = {
        "validation_accuracy": float(acc),
        "confusion_matrix": cm.tolist(),
        "classification_report": report_dict
    }
    with open(out_dir / "metrics_train.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    # ✅ save confusion matrix CSV
    pd.DataFrame(cm).to_csv(out_dir / "confusion_matrix_train.csv", index=False)

    # ✅ save classification report CSV (as table)
    pd.DataFrame(report_dict).transpose().to_csv(out_dir / "classification_report_train.csv")

    print("\n✅ Saved outputs:")
    print(" - ml/outputs/metrics_train.json")
    print(" - ml/outputs/confusion_matrix_train.csv")
    print(" - ml/outputs/classification_report_train.csv")

    # ✅ save model
    Path(MODEL_PATH).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print("\n✅ Saved model to:", MODEL_PATH)


if __name__ == "__main__":
    main()