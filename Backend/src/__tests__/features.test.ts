// features.test.ts
// Unit tests for Cases 20 and 21: feature engineering for the fire risk model.
// Verifies that buildFeatures() produces the correct 6-feature vector from
// weather input data, and that optional fields default correctly when absent.

export {};

// The exact set of feature column names expected by the trained XGBoost model.
// Any mismatch between this list and the model's training features causes a
// shape or column name error at prediction time.
const FEATURES = [
  "temperature_2m_max",
  "relative_humidity_2m_min",
  "wind_speed_10m_max",
  "precipitation_sum",
  "et0_fao_evapotranspiration",
  "vapour_pressure_deficit_max",
];

// Shape of the raw weather data passed into the feature builder.
// wind_speed_10m_max is optional because IoT devices may not have a wind sensor —
// it defaults to 0.0 in buildFeatures() when absent.
interface WeatherInput {
  temperature_2m_max:          number;
  relative_humidity_2m_min:    number;
  wind_speed_10m_max?:         number;  // Optional — defaults to 0.0 if not provided
  precipitation_sum:           number;
  et0_fao_evapotranspiration:  number;
  vapour_pressure_deficit_max: number;
}

// Maps a WeatherInput object to the flat feature record expected by the model.
// Ensures all 6 feature keys are always present in the output regardless of
// which input fields were provided, using 0.0 as the safe default for wind.
function buildFeatures(input: WeatherInput): Record<string, number> {
  return {
    temperature_2m_max:          input.temperature_2m_max,
    relative_humidity_2m_min:    input.relative_humidity_2m_min,
    wind_speed_10m_max:          input.wind_speed_10m_max ?? 0.0,  // Default to calm if sensor absent
    precipitation_sum:           input.precipitation_sum,
    et0_fao_evapotranspiration:  input.et0_fao_evapotranspiration,
    vapour_pressure_deficit_max: input.vapour_pressure_deficit_max,
  };
}


describe("Case 20 — Feature Engineering: Six-Feature Vector", () => {

  // Full weather reading with all fields present including wind speed
  const sampleInput: WeatherInput = {
    temperature_2m_max:          34.5,
    relative_humidity_2m_min:    42,
    wind_speed_10m_max:          15.2,
    precipitation_sum:           0.0,
    et0_fao_evapotranspiration:  5.1,
    vapour_pressure_deficit_max: 3.2,
  };

  test("buildFeatures returns correct 6-feature vector", () => {
    const result = buildFeatures(sampleInput);

    console.log("Case 20: Feature Engineering");
    console.log("  Input weather data:");
    Object.entries(sampleInput).forEach(([k, v]) => {
      console.log(`    ${k.padEnd(32)}: ${v}`);
    });
    console.log("  Output feature vector:");
    Object.entries(result).forEach(([k, v]) => {
      console.log(`    ${k.padEnd(32)}: ${v}`);
    });
    console.log("  Total features returned   :", Object.keys(result).length);
    console.log("  Keys match FEATURES list  :", JSON.stringify(Object.keys(result).sort()) === JSON.stringify([...FEATURES].sort()));

    // Output must contain exactly the 6 features the model was trained on
    expect(Object.keys(result)).toHaveLength(6);

    // Key names must match FEATURES exactly — sorted comparison ignores insertion order
    expect(Object.keys(result).sort()).toEqual([...FEATURES].sort());

    // Each value must be passed through unchanged from the input
    expect(result.temperature_2m_max).toBe(34.5);
    expect(result.relative_humidity_2m_min).toBe(42);
    expect(result.wind_speed_10m_max).toBe(15.2);
    expect(result.precipitation_sum).toBe(0.0);
    expect(result.et0_fao_evapotranspiration).toBe(5.1);
    expect(result.vapour_pressure_deficit_max).toBe(3.2);
  });
});


describe("Case 21 — IoT Feature Builder: Missing Wind Default", () => {

  test("defaults wind_speed_10m_max to 0.0 when not provided", () => {

    // Input without wind_speed_10m_max — simulates an IoT device that has no wind sensor
    const inputWithoutWind: WeatherInput = {
      temperature_2m_max:          30.0,
      relative_humidity_2m_min:    55,
      precipitation_sum:           0.0,
      et0_fao_evapotranspiration:  4.0,
      vapour_pressure_deficit_max: 2.5,
    };

    const result = buildFeatures(inputWithoutWind);

    console.log("Case 21: IoT Missing Wind Default");
    console.log("  wind_speed_10m_max provided :", false);
    console.log("  wind_speed_10m_max in result :", result.wind_speed_10m_max);
    console.log("  Default value applied        :", result.wind_speed_10m_max === 0.0);
    console.log("  Total features returned      :", Object.keys(result).length);
    console.log("  Output feature vector:");
    Object.entries(result).forEach(([k, v]) => {
      console.log(`    ${k.padEnd(32)}: ${v}`);
    });

    // Wind must default to 0.0 so the model always receives a valid numeric value
    expect(result.wind_speed_10m_max).toBe(0.0);

    // All 6 features must still be present even though wind was not supplied
    expect(Object.keys(result)).toHaveLength(6);
  });
});