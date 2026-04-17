// UT-37
// Tests: CODE_TO_LABEL returns correct label for each risk code

const CODE_TO_LABEL: Record<number, string> = {
  0: "Low",
  1: "Moderate",
  2: "High",
  3: "Extreme",
};

describe("UT-37 — Risk label function (CODE_TO_LABEL)", () => {

  // UT-37 — code 0 returns Low
  test("UT-37a: returns Low for risk code 0", () => {
    expect(CODE_TO_LABEL[0]).toBe("Low");
  });

  // UT-37 — code 1 returns Moderate
  test("UT-37b: returns Moderate for risk code 1", () => {
    expect(CODE_TO_LABEL[1]).toBe("Moderate");
  });

  // UT-37 — code 2 returns High
  test("UT-37c: returns High for risk code 2", () => {
    expect(CODE_TO_LABEL[2]).toBe("High");
  });

  // UT-37 — code 3 returns Extreme
  test("UT-37d: returns Extreme for risk code 3", () => {
    expect(CODE_TO_LABEL[3]).toBe("Extreme");
  });

  // Extra — all four codes exist
  test("all four risk codes are defined", () => {
    expect(Object.keys(CODE_TO_LABEL)).toHaveLength(4);
  });

});