// risk.test.ts
// Unit tests for Case 23: RISK_COLOR utility.
// Verifies that each risk level maps to the correct hex color value and
// that all color values are valid 6-digit hex codes.

export {};

// Union type restricting risk level strings to the four valid values.
// Prevents typos from being passed to getRiskColor() at compile time.
type RiskLevel = "Low" | "Moderate" | "High" | "Extreme";

// Maps each risk level to its display color used in email templates
// and the frontend dashboard. Must stay in sync with RISK_COLOR in email_helpers.py.
const RISK_COLOR: Record<RiskLevel, string> = {
  Low:      "#9DC88D",  // Green  — low danger
  Moderate: "#F1B24A",  // Amber  — elevated danger
  High:     "#FF8C42",  // Orange — high danger
  Extreme:  "#FF4D4D",  // Red    — critical danger
};

// Returns the hex color string for a given risk level.
// Typed to RiskLevel so passing an unrecognised string is a compile error.
function getRiskColor(level: RiskLevel): string {
  return RISK_COLOR[level];
}


describe("Case 23 — RISK_COLOR Utility", () => {

  test("returns correct hex colors for all four risk levels", () => {
    const levels: RiskLevel[] = ["Low", "Moderate", "High", "Extreme"];

    console.log("Case 23: RISK_COLOR Utility");
    levels.forEach(level => {
      const colour = getRiskColor(level);
      console.log(`  ${level.padEnd(10)} : ${colour}`);
    });
    console.log("  All hex codes valid  :", levels.every(l => /^#[0-9A-Fa-f]{6}$/.test(getRiskColor(l))));
    console.log("  All colors unique    :", new Set(levels.map(l => getRiskColor(l))).size === levels.length);

    // Each level must return exactly the color value configured above
    expect(getRiskColor("Low")).toBe("#9DC88D");
    expect(getRiskColor("Moderate")).toBe("#F1B24A");
    expect(getRiskColor("High")).toBe("#FF8C42");
    expect(getRiskColor("Extreme")).toBe("#FF4D4D");
  });

  test("all color values are valid hex codes", () => {
    // Regex matches exactly a # followed by 6 hexadecimal characters
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;

    Object.entries(RISK_COLOR).forEach(([level, colour]) => {
      console.log(`  Validating ${level.padEnd(10)}: ${colour} — valid: ${hexPattern.test(colour)}`);

      // Each value in RISK_COLOR must be a valid 6-digit hex color string
      expect(colour).toMatch(hexPattern);
    });
  });
});