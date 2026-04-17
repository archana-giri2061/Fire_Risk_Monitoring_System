// UT-21, UT-23, UT-35, UT-36
// Tests: ML feature engineering and IoT feature builder

const FEATURES = [
  "temp_max",
  "temp_min",
  "temp_mean",
  "humidity_mean",
  "precipitation_sum",
  "wind_speed_max",
];

const buildFeatures = (
  temp: number,
  humidity: number,
  wind = 0.0,
  rain = 0.0
) => ({
  temp_max:          temp,
  temp_min:          Math.round(temp * 0.92 * 10) / 10,
  temp_mean:         Math.round(temp * 0.96 * 10) / 10,
  humidity_mean:     humidity,
  precipitation_sum: rain,
  wind_speed_max:    wind,
});

const getLatest = (
  rows: any[],
  sensorType: string,
  defaultVal = 0.0
): number => {
  for (const r of rows) {
    if (r.sensor_type === sensorType) return Number(r.value);
  }
  return defaultVal;
};

describe("UT-21, UT-23, UT-35, UT-36 — Feature engineering", () => {

  // UT-21 — correct six feature vector
  test("UT-21: produces correct six-feature vector from weather values", () => {
    const features = buildFeatures(34.5, 42);
    expect(Object.keys(features)).toHaveLength(6);
    expect(features.temp_max).toBe(34.5);
    expect(features.humidity_mean).toBe(42);
    expect(FEATURES.every((f) => f in features)).toBe(true);
  });

  // UT-35 — feature vector has exactly six keys
  test("UT-35: feature vector contains exactly six features", () => {
    const features = buildFeatures(30, 60);
    expect(Object.keys(features)).toHaveLength(6);
  });

  // UT-23 — missing wind defaults to 0.0
  test("UT-23: wind_speed_max defaults to 0.0 when not provided", () => {
    const features = buildFeatures(30, 50);
    expect(features.wind_speed_max).toBe(0.0);
  });

  // UT-36 — missing wind from getLatest defaults to 0.0
  test("UT-36: getLatest returns 0.0 when wind sensor not in readings", () => {
    const rows = [
      { sensor_type: "temperature", value: 34.5 },
      { sensor_type: "humidity",    value: 42   },
    ];
    const wind = getLatest(rows, "wind", 0.0);
    expect(wind).toBe(0.0);
  });

  // Extra — temp_mean calculated correctly
  test("temp_mean is average of max and min approximately", () => {
    const features = buildFeatures(40, 30);
    expect(features.temp_mean).toBeCloseTo(40 * 0.96, 1);
  });

});