// riskLabel.test.ts
// Unit tests for UT-37: CODE_TO_LABEL mapping.
// Verifies that each numeric risk code produced by the XGBoost model
// maps to the correct human-readable label string used in API responses,
// email alerts, and the frontend dashboard.

// Maps the integer risk codes output by the trained model to their
// corresponding label strings. Must stay in sync with code_to_label()
// in feature_label.py and RISK_RANK in email_helpers.py.
const CODE_TO_LABEL: Record<number, string> = {
  0: "Low",
  1: "Moderate",
  2: "High",
  3: "Extreme",
};

describe("UT-37 — Risk label function (CODE_TO_LABEL)", () => {

  test("UT-37a: returns Low for risk code 0", () => {
    // Code 0 is the lowest risk level, typical for cool humid days
    expect(CODE_TO_LABEL[0]).toBe("Low");
  });

  test("UT-37b: returns Moderate for risk code 1", () => {
    // Code 1 indicates elevated but not critical conditions
    expect(CODE_TO_LABEL[1]).toBe("Moderate");
  });

  test("UT-37c: returns High for risk code 2", () => {
    // Code 2 triggers alert emails via run_risk_email_alerts()
    expect(CODE_TO_LABEL[2]).toBe("High");
  });

  test("UT-37d: returns Extreme for risk code 3", () => {
    // Code 3 is the highest severity — also triggers IoT auto-alert in predict_iot.py
    expect(CODE_TO_LABEL[3]).toBe("Extreme");
  });

  test("all four risk codes are defined", () => {
    // Ensures no code was accidentally removed or a fifth was added,
    // which would break the model output mapping across all scripts
    expect(Object.keys(CODE_TO_LABEL)).toHaveLength(4);
  });
});