// Represents one day's fire-risk prediction as stored in the database.
// Records are created by the ML pipeline when POST /api/ml/predict is called
// and are read back by the forecast page and the 7-day risk panels.
export type PredictionRecord = {
  date:       string;  // the calendar date this prediction covers, formatted as YYYY-MM-DD
  latitude:   number;  // geographic latitude of the monitored location, e.g. 28.002 for Lumbini
  longitude:  number;  // geographic longitude of the monitored location, e.g. 83.036 for Lumbini
  risk_code:  number;  // numeric class output from the XGBoost model: 0 = Low, 1 = Moderate, 2 = High, 3 = Extreme
  risk_label: string;  // human-readable version of risk_code, e.g. "Low", "Moderate", "High", "Extreme"
  model_name: string;  // identifier of the model that produced this prediction, e.g. "XGBoost"
  created_at: string;  // ISO 8601 timestamp of when this prediction record was saved to the database
};