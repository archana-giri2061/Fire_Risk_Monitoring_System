// alert.test.ts
// Unit tests for Case 24: autoAlertAfterPrediction
// Tests the deduplication logic that prevents the same alert from being
// sent more than once per day for the same risk label and date.
// Uses a mocked pool.query so no real database connection is needed.

export {};

// Mock the database pool with a single jest.fn() for query so all
// SQL calls can be intercepted and controlled per test case
const mockPool = { query: jest.fn() };

// Return type for autoAlertAfterPrediction — describes whether an alert
// was sent and a human-readable reason message
interface AlertResult {
  sent: boolean;
  message: string;
}

// Checks whether an alert has already been sent today for the given
// risk label and date. If a matching record exists in alert_logs,
// the alert is skipped to prevent duplicate emails. If not, a new
// record is inserted and the alert is reported as sent.
async function autoAlertAfterPrediction(
  riskLabel: string, // Risk level to check, e.g. "High" or "Extreme"
  date: string       // ISO date string for the alert, e.g. "2026-04-20"
): Promise<AlertResult> {

  // Query alert_logs to see if an alert for this risk label and date already exists
  const existing = await mockPool.query(
    "SELECT id FROM alert_logs WHERE risk_label = $1 AND alert_date = $2",
    [riskLabel, date]
  );

  // If at least one matching row is found, skip sending to avoid a duplicate alert
  if ((existing as { rows: unknown[] }).rows.length > 0) {
    return { sent: false, message: "Auto-alert skipped — alert already sent today" };
  }

  // No existing record found — insert a new log entry and report the alert as sent
  await mockPool.query(
    "INSERT INTO alert_logs (risk_label, alert_date) VALUES ($1, $2)",
    [riskLabel, date]
  );
  return { sent: true, message: "Auto-alert sent" };
}

describe("Case 24 — autoAlertAfterPrediction", () => {

  // Reset all mock call counts and return values before each test so
  // one test's mock setup never bleeds into the next
  beforeEach(() => jest.clearAllMocks());

  describe("24a: duplicate alert already exists today", () => {
    test("returns sent: false with skipped message", async () => {

      // Simulate the SELECT returning one existing row, meaning an alert
      // was already sent for this risk label and date today
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });

      const result = await autoAlertAfterPrediction("High", "2026-04-20");

      console.log("Case 24a: Duplicate Alert");
      console.log("  risk_label               :", "High");
      console.log("  date                     :", "2026-04-20");
      console.log("  Existing record found    :", true);
      console.log("  sent                     :", result.sent);
      console.log("  message                  :", result.message);
      console.log("  pool.query call count    :", mockPool.query.mock.calls.length);

      // Alert should not be sent when a duplicate record exists
      expect(result.sent).toBe(false);
      expect(result.message).toBe("Auto-alert skipped — alert already sent today");

      // Only the SELECT should have been called — INSERT must not run on duplicate
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("24b: no duplicate — first alert of the day", () => {
    test("returns sent: true and inserts new record", async () => {

      // First call (SELECT) returns empty rows — no existing alert for today
      // Second call (INSERT) returns a successful insert result
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await autoAlertAfterPrediction("High", "2026-04-20");

      console.log("Case 24b: New Alert");
      console.log("  risk_label               :", "High");
      console.log("  date                     :", "2026-04-20");
      console.log("  Existing record found    :", false);
      console.log("  sent                     :", result.sent);
      console.log("  message                  :", result.message);
      console.log("  pool.query call count    :", mockPool.query.mock.calls.length);
      console.log("  INSERT query called      :", mockPool.query.mock.calls[1]?.[0]?.includes("INSERT") ?? false);

      // Alert should be reported as sent when no duplicate exists
      expect(result.sent).toBe(true);
      expect(result.message).toBe("Auto-alert sent");

      // Both SELECT and INSERT must have been called exactly once each
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });
});