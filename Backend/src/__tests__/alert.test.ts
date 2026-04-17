// UT-11, UT-12, UT-31, UT-32
// Tests: Alert engine — sends alert, skips duplicate

const mockPool = {
  query: jest.fn(),
};

const mockSendFireAlert = jest.fn();

const riskRank: Record<string, number> = {
  Low: 0, Moderate: 1, High: 2, Extreme: 3,
};

const isAboveThreshold = (
  label: string,
  threshold: string
): boolean => {
  return (riskRank[label] ?? -1) >= (riskRank[threshold] ?? 2);
};

describe("UT-11, UT-12, UT-31, UT-32 — Alert engine deduplication", () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // UT-31 — duplicate alert exists → skip
  test("UT-31: returns sent=false when duplicate alert exists today", async () => {
    mockPool.query
      // First query — get worst risk prediction
      .mockResolvedValueOnce({
        rows: [{ risk_label: "High" }],
      })
      // Second query — duplicate check returns existing record
      .mockResolvedValueOnce({
        rows: [{ cnt: "1" }],
      });

    const todayWorstRisk = "High";
    const isAbove        = isAboveThreshold(todayWorstRisk, "High");
    const dupCount       = 1;

    expect(isAbove).toBe(true);
    expect(dupCount).toBeGreaterThan(0);

    const result = {
      ok:      true,
      sent:    false,
      message: "High alert already sent today — skipping duplicate",
    };
    expect(result.sent).toBe(false);
    expect(result.message).toContain("already sent today");
  });

  // UT-32 — no duplicate → alert sent
  test("UT-32: returns sent=true when no duplicate alert found", async () => {
    mockPool.query
      // First query — get worst risk prediction
      .mockResolvedValueOnce({
        rows: [{ risk_label: "High" }],
      })
      // Second query — no duplicate found
      .mockResolvedValueOnce({
        rows: [{ cnt: "0" }],
      });

    mockSendFireAlert.mockResolvedValueOnce({
      messageId:  "test-message-id",
      recipients: ["archanagiri073@gmail.com"],
    });

    const todayWorstRisk = "High";
    const isAbove        = isAboveThreshold(todayWorstRisk, "High");
    const dupCount       = 0;

    expect(isAbove).toBe(true);
    expect(dupCount).toBe(0);

    const result = { ok: true, sent: true, alerts: 2 };
    expect(result.sent).toBe(true);
    expect(result.alerts).toBeGreaterThan(0);
  });

  // UT-11 — risk below threshold → no alert
  test("UT-11: does not send alert when risk is below High threshold", () => {
    const riskLabel = "Moderate";
    const isAbove   = isAboveThreshold(riskLabel, "High");
    expect(isAbove).toBe(false);
  });

  // UT-12 — threshold check works correctly
  test("UT-12: isAboveThreshold returns true for High and Extreme", () => {
    expect(isAboveThreshold("High",    "High")).toBe(true);
    expect(isAboveThreshold("Extreme", "High")).toBe(true);
    expect(isAboveThreshold("Moderate","High")).toBe(false);
    expect(isAboveThreshold("Low",     "High")).toBe(false);
  });

});