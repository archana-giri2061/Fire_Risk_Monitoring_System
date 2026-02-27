import pandas as pd

def make_risk_label(df: pd.DataFrame) -> pd.DataFrame:
    """
    Creates risk_score + risk_code (0-3) using available fields.
    Uses quantiles => stable for your dataset.
    """
    df = df.copy()

    # optional columns (DB forecast has these, Excel doesn't)
    if "wind_speed_max" not in df.columns:
        df["wind_speed_max"] = 0.0
    if "precipitation_sum" not in df.columns:
        df["precipitation_sum"] = 0.0

    # Risk score (simple + sensible)
    df["risk_score"] = (
        (df["temp_mean"] * 1.0)
        - (df["humidity_mean"] * 0.35)
        + (df["wind_speed_max"] * 0.25)
        - (df["precipitation_sum"] * 0.20)
    )

    q1 = df["risk_score"].quantile(0.25)
    q2 = df["risk_score"].quantile(0.50)
    q3 = df["risk_score"].quantile(0.75)

    def to_code(x):
        if x <= q1: return 0  # Low
        if x <= q2: return 1  # Moderate
        if x <= q3: return 2  # High
        return 3              # Extreme

    df["risk_code"] = df["risk_score"].apply(to_code).astype(int)
    return df

def code_to_label(code: int) -> str:
    return {0: "Low", 1: "Moderate", 2: "High", 3: "Extreme"}.get(int(code), "Unknown")