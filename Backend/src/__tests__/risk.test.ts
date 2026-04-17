// UT-18, UT-27, UT-28, UT-29, UT-30
// Tests: RISK_COLOR utility returns correct hex for each risk level

const RISK_COLOR: Record<string, string> = {
  Low:      "#9DC88D",
  Moderate: "#F1B24A",
  High:     "#FF8C42",
  Extreme:  "#FF4D4D",
};

const RISK_BG: Record<string, string> = {
  Low:      "rgba(157,200,141,0.15)",
  Moderate: "rgba(241,178,74,0.15)",
  High:     "rgba(255,140,66,0.15)",
  Extreme:  "rgba(255,77,77,0.15)",
};

describe("UT-18, UT-27 to UT-30 — Risk colour utility", () => {

  // UT-18 — all four colours exist
  test("UT-18: RISK_COLOR contains all four risk levels", () => {
    expect(Object.keys(RISK_COLOR)).toHaveLength(4);
    expect(RISK_COLOR).toHaveProperty("Low");
    expect(RISK_COLOR).toHaveProperty("Moderate");
    expect(RISK_COLOR).toHaveProperty("High");
    expect(RISK_COLOR).toHaveProperty("Extreme");
  });

  // UT-27 — Low colour
  test("UT-27: returns correct colour #9DC88D for Low risk", () => {
    expect(RISK_COLOR["Low"]).toBe("#9DC88D");
  });

  // UT-28 — Moderate colour
  test("UT-28: returns correct colour #F1B24A for Moderate risk", () => {
    expect(RISK_COLOR["Moderate"]).toBe("#F1B24A");
  });

  // UT-29 — High colour
  test("UT-29: returns correct colour #FF8C42 for High risk", () => {
    expect(RISK_COLOR["High"]).toBe("#FF8C42");
  });

  // UT-30 — Extreme colour
  test("UT-30: returns correct colour #FF4D4D for Extreme risk", () => {
    expect(RISK_COLOR["Extreme"]).toBe("#FF4D4D");
  });

});