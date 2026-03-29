import pandas as pd

# Fixed risk score thresholds — NOT quantile-based.
# This ensures training and forecast inference use identical boundaries.
RISK_THRESHOLDS = {
    "low_max":      10.0,   # score <= 10  -> Low
    "moderate_max": 18.0,   # score <= 18  -> Moderate
    "high_max":     26.0,   # score <= 26  -> High
    # score > 26            -> Extreme
}


def compute_risk_score(df: pd.DataFrame) -> "pd.Series":
    wind = df["wind_speed_max"] if "wind_speed_max" in df.columns else 0.0
    rain = df["precipitation_sum"] if "precipitation_sum" in df.columns else 0.0
    return (
        df["temp_mean"] * 1.0
        - df["humidity_mean"] * 0.35
        + wind * 0.25
        - rain * 0.20
    )


def make_risk_label(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "wind_speed_max" not in df.columns:
        df["wind_speed_max"] = 0.0
    if "precipitation_sum" not in df.columns:
        df["precipitation_sum"] = 0.0

    df["risk_score"] = compute_risk_score(df)

    def to_code(x: float) -> int:
        if x <= RISK_THRESHOLDS["low_max"]:      return 0
        if x <= RISK_THRESHOLDS["moderate_max"]: return 1
        if x <= RISK_THRESHOLDS["high_max"]:     return 2
        return 3

    df["risk_code"] = df["risk_score"].apply(to_code).astype(int)
    return df


def code_to_label(code: int) -> str:
    return {0: "Low", 1: "Moderate", 2: "High", 3: "Extreme"}.get(int(code), "Unknown")

def label_to_code(label: str) -> int:
    return {"Low": 0, "Moderate": 1, "High": 2, "Extreme": 3}.get(label, 0)