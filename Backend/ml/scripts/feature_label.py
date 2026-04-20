# feature_label.py
# Shared utility module for computing fire risk scores and converting them
# to risk labels and numeric codes.
# Imported by train_model.py, predict_forecast.py, and predict_iot.py to ensure
# all scripts use identical scoring logic and label boundaries.

import pandas as pd


# Fixed numeric thresholds that map a computed risk score to one of four risk levels.
# These are hard-coded constants rather than quantile-based boundaries so that
# training and all inference scripts always use the same cutoffs regardless of
# the data distribution at runtime.
# The comment values show typical scores for each season at the monitored location.
RISK_THRESHOLDS = {
    "low_max":      6.0,   # Score <= 6  -> Low      (typical April score: ~3.5)
    "moderate_max": 12.0,  # Score <= 12 -> Moderate (typical May score:   ~9)
    "high_max":     18.0,  # Score <= 18 -> High     (typical June score:  ~15)
                           # Score >  18 -> Extreme  (peak summer score:   ~21)
}


def compute_risk_score(df: pd.DataFrame) -> "pd.Series":
    """
    Computes a continuous numeric fire risk score for each row in the DataFrame.
    The score is a weighted linear combination of weather features where:
      - Higher temperature increases risk
      - Higher humidity decreases risk
      - Higher wind speed increases risk (wind spreads fire)
      - Higher precipitation decreases risk (wet conditions reduce ignition)

    wind_speed_max and precipitation_sum are optional columns — they default
    to 0.0 if absent so the function works on DataFrames that only have the
    core temperature and humidity columns.

    Parameters:
        df: DataFrame with at minimum temp_mean and humidity_mean columns

    Returns:
        A pandas Series of float risk scores, one per row
    """
    # Use the column if present, otherwise treat the feature as zero for all rows
    wind = df["wind_speed_max"]    if "wind_speed_max"    in df.columns else 0.0
    rain = df["precipitation_sum"] if "precipitation_sum" in df.columns else 0.0

    return (
        df["temp_mean"]      *  1.00   # Temperature is the primary driver of fire risk
        - df["humidity_mean"] *  0.35  # Humidity suppresses risk — weighted less than temperature
        + wind                *  0.25  # Wind amplifies spread risk but less than temperature
        - rain                *  0.20  # Precipitation suppresses risk — weighted least
    )


def make_risk_label(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds risk_score and risk_code columns to the DataFrame based on weather features.
    Ensures optional columns exist before scoring so downstream code can always
    access risk_score and risk_code without checking for missing columns.

    Parameters:
        df: DataFrame containing at minimum temp_mean and humidity_mean columns

    Returns:
        A new DataFrame (copy of input) with two additional columns:
          risk_score : float — raw computed score from compute_risk_score()
          risk_code  : int   — 0=Low, 1=Moderate, 2=High, 3=Extreme
    """
    df = df.copy()  # Never mutate the caller's DataFrame

    # Fill in missing optional columns with neutral zero values before scoring
    if "wind_speed_max" not in df.columns:
        df["wind_speed_max"] = 0.0
    if "precipitation_sum" not in df.columns:
        df["precipitation_sum"] = 0.0

    df["risk_score"] = compute_risk_score(df)

    def to_code(x: float) -> int:
        """Maps a single risk score to its integer risk code using fixed thresholds."""
        if x <= RISK_THRESHOLDS["low_max"]:      return 0  # Low
        if x <= RISK_THRESHOLDS["moderate_max"]: return 1  # Moderate
        if x <= RISK_THRESHOLDS["high_max"]:     return 2  # High
        return 3                                            # Extreme

    # Apply the threshold function to every row and store as integer for the ML model
    df["risk_code"] = df["risk_score"].apply(to_code).astype(int)
    return df


def code_to_label(code: int) -> str:
    """
    Converts a numeric risk code to its human-readable label string.
    Used when formatting prediction results for API responses and email alerts.

    Parameters:
        code: Integer risk code (0, 1, 2, or 3)

    Returns:
        Risk label string, or "Unknown" if the code is not recognised
    """
    return {0: "Low", 1: "Moderate", 2: "High", 3: "Extreme"}.get(int(code), "Unknown")


def label_to_code(label: str) -> int:
    """
    Converts a risk label string back to its numeric code.
    Used when reading labels from the database or API responses and
    needing to compare or rank them numerically.

    Parameters:
        label: Risk label string e.g. "High"

    Returns:
        Integer risk code, or 0 (Low) if the label is not recognised
    """
    return {"Low": 0, "Moderate": 1, "High": 2, "Extreme": 3}.get(label, 0)