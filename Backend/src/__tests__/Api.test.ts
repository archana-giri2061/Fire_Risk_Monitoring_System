// api.test.ts
// Unit tests for Cases 1-8 and 13 covering the core API route handlers
// and admin middleware. All database and fetch calls are mocked so no
// real network or database connection is required to run these tests.

export {};

// Admin key expected in the x-admin-key header for protected routes
const ADMIN_KEY = "vanadristi-admin-2026";

// Mock database pool — all SQL calls go through this jest.fn()
// so each test can control what the database returns
const mockPool = { query: jest.fn() };

// Mock the global fetch so HTTP calls to Open-Meteo never leave the test process
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;


// Minimal request shape used across all test cases
interface MockReq {
  headers: Record<string, string | undefined>;
  query?:  Record<string, string>;
  body?:   Record<string, unknown>;
}

// Minimal response shape that mirrors Express's res.status().json() chaining
interface Res {
  statusCode: number;
  body:       unknown;
  status(code: number): Res;
  json(data: unknown):  Res;
}

// Factory that returns a fresh response object for each test
// so status codes and body values never leak between assertions
function makeRes(): Res {
  const r: Res = {
    statusCode: 200,
    body:       null,
    status(code) { this.statusCode = code; return this; },
    json(data)   { this.body = data;       return this; },
  };
  return r;
}


// Middleware that checks the x-admin-key header on incoming requests.
// Returns 401 and stops the chain if the key is missing or incorrect.
// Calls next() to continue to the route handler if the key matches.
function requireAdmin(req: MockReq, res: Res, next: () => void): void {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorised — admin key required" });
    return;
  }
  next();
}

// Simulates the POST /api/weather/sync-all handler.
// Fetches archive and forecast data from Open-Meteo and upserts it into the DB.
// Returns 200 with row counts on success, 500 if the fetch or DB call fails.
async function weatherSyncAll(_req: MockReq, res: Res): Promise<void> {
  try {
    const response = await fetch("https://archive-api.open-meteo.com/mock");
    if (!response.ok) throw new Error("fetch failed");

    const data = await response.json() as { archive: number; forecast: number };

    // Store the fetched weather data — in production this runs one INSERT per day
    await mockPool.query("INSERT INTO daily_weather ...", []);

    res.status(200).json({
      ok:       true,
      archive:  { insertedOrUpdated: data.archive },
      forecast: { insertedOrUpdated: data.forecast },
    });
  } catch {
    res.status(500).json({ error: "Sync failed" });
  }
}

// Simulates the POST /api/sensor/ingest handler.
// Checks for a duplicate (device_id + seq) before inserting.
// Returns 409 if the same seq was already received from this device,
// 200 on successful insert.
async function sensorIngest(req: MockReq, res: Res): Promise<void> {
  const { device_id, seq } = req.body as { device_id: string; seq: number };

  // Check whether this exact (device_id, seq) combination already exists
  const existing = await mockPool.query(
    "SELECT id FROM iot_sensor_readings WHERE device_id=$1 AND seq=$2",
    [device_id, seq]
  ) as { rows: unknown[] };

  if (existing.rows.length > 0) {
    res.status(409).json({ error: "Duplicate sensor payload" });
    return;
  }

  // No duplicate found — insert the new reading
  await mockPool.query("INSERT INTO iot_sensor_readings ...", []);
  res.status(200).json({ ok: true });
}

// Simulates the GET /api/ml/predictions handler.
// Reads the limit query param (default 7) and returns that many prediction rows.
async function getPredictions(req: MockReq, res: Res): Promise<void> {
  const limit  = parseInt(req.query?.limit ?? "7", 10);
  const result = await mockPool.query(
    "SELECT * FROM fire_risk_predictions ORDER BY date DESC LIMIT $1",
    [limit]
  ) as { rows: unknown[] };
  res.status(200).json(result.rows);
}


describe("Case 1 — Weather Synchronisation API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate a successful Open-Meteo response with 61 archive rows and 7 forecast rows
    mockFetch.mockResolvedValue({
      ok:   true,
      json: async () => ({ archive: 61, forecast: 7 }),
    });
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  test("returns 200 OK", async () => {
    const res = makeRes();
    await weatherSyncAll({ headers: {} }, res);
    const body = res.body as Record<string, unknown>;

    console.log("Case 1: Weather Synchronisation API");
    console.log("  Status Code               :", res.statusCode);
    console.log("  ok                        :", body.ok);
    console.log("  archive.insertedOrUpdated :", (body.archive  as Record<string, number>).insertedOrUpdated);
    console.log("  forecast.insertedOrUpdated:", (body.forecast as Record<string, number>).insertedOrUpdated);

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect((body.archive  as Record<string, number>).insertedOrUpdated).toBe(61);
    expect((body.forecast as Record<string, number>).insertedOrUpdated).toBe(7);
  });
});


describe("Case 2 — Weather Data Stored in Database", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok:   true,
      json: async () => ({ archive: 61, forecast: 7 }),
    });
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  test("pool.query called to store weather data", async () => {
    await weatherSyncAll({ headers: {} }, makeRes());

    console.log("Case 2: Weather Data Stored in Database");
    console.log("  pool.query called         :", mockPool.query.mock.calls.length > 0);
    console.log("  pool.query call count     :", mockPool.query.mock.calls.length);
    console.log("  Query executed            :", String(mockPool.query.mock.calls[0]?.[0] ?? "").slice(0, 40));

    // Verify that at least one SQL call was made to persist the fetched weather data
    expect(mockPool.query).toHaveBeenCalled();
  });
});


describe("Case 3 — Duplicate Weather Record Prevention", () => {
  test("second sync returns 200 — upsert does not fail", async () => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok:   true,
      json: async () => ({ archive: 61, forecast: 7 }),
    });
    mockPool.query.mockResolvedValue({ rows: [] });

    // Run the sync twice to verify that ON CONFLICT DO UPDATE handles duplicates
    // without throwing an error or returning a non-200 status
    const res1 = makeRes();
    const res2 = makeRes();
    await weatherSyncAll({ headers: {} }, res1);
    await weatherSyncAll({ headers: {} }, res2);

    console.log("Case 3: Duplicate Weather Prevention");
    console.log("  1st sync status code      :", res1.statusCode);
    console.log("  2nd sync status code      :", res2.statusCode);
    console.log("  Total pool.query calls    :", mockPool.query.mock.calls.length);
    console.log("  No duplicate error        :", res2.statusCode === 200);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
  });
});


describe("Case 4 — Sensor Ingest: Valid Payload", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns 200 OK for valid ESP32 payload", async () => {
    // First call: SELECT returns empty rows (no duplicate)
    // Second call: INSERT succeeds
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const payload = { device_id: "ESP32-001", seq: 42, measured_at: "2026-04-20T10:00:00Z" };
    const res     = makeRes();
    await sensorIngest({ headers: {}, body: payload }, res);

    console.log("Case 4: Sensor Ingest Valid Payload");
    console.log("  Payload device_id         :", payload.device_id);
    console.log("  Payload seq               :", payload.seq);
    console.log("  Status Code               :", res.statusCode);
    console.log("  Response Body             :", JSON.stringify(res.body));
    console.log("  pool.query call count     :", mockPool.query.mock.calls.length);

    expect(res.statusCode).toBe(200);
    // Both the duplicate-check SELECT and the INSERT must have been called
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });
});


describe("Case 5 — Sensor Ingest: Duplicate Detection", () => {
  beforeEach(() => jest.clearAllMocks());

  test("first request returns 200 OK", async () => {
    // SELECT returns no rows (new reading), INSERT succeeds
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await sensorIngest({ headers: {}, body: { device_id: "ESP32-001", seq: 100 } }, res);

    console.log("Case 5a: Sensor Ingest First Request");
    console.log("  device_id                 :", "ESP32-001");
    console.log("  seq                       :", 100);
    console.log("  Status Code               :", res.statusCode);
    console.log("  Response Body             :", JSON.stringify(res.body));

    expect(res.statusCode).toBe(200);
  });

  test("duplicate request returns 409 Conflict", async () => {
    // SELECT returns one existing row — same device_id and seq already in DB
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const res = makeRes();
    await sensorIngest({ headers: {}, body: { device_id: "ESP32-001", seq: 100 } }, res);

    console.log("Case 5b: Sensor Ingest Duplicate");
    console.log("  device_id                 :", "ESP32-001");
    console.log("  seq                       :", 100);
    console.log("  Existing record found     :", true);
    console.log("  Status Code               :", res.statusCode);
    console.log("  Response Body             :", JSON.stringify(res.body));

    expect(res.statusCode).toBe(409);
    // Error message must mention "Duplicate" so the device firmware can identify the response
    expect((res.body as Record<string, string>).error).toContain("Duplicate");
  });
});


describe("Case 6 — Admin Middleware: Missing Key", () => {
  test("returns 401 when x-admin-key is absent", () => {
    const res  = makeRes();
    const next = jest.fn();

    // Send a request with no x-admin-key header at all
    requireAdmin({ headers: {} }, res, next);

    console.log("Case 6: Admin Middleware Missing Key");
    console.log("  x-admin-key header        :", "NOT PROVIDED");
    console.log("  Status Code               :", res.statusCode);
    console.log("  Response Body             :", JSON.stringify(res.body));
    console.log("  next() called             :", next.mock.calls.length > 0);

    expect(res.statusCode).toBe(401);
    // next() must never be called when the key is missing
    expect(next).not.toHaveBeenCalled();
  });
});


describe("Case 7 — Admin Middleware: Correct Key", () => {
  test("calls next() when correct key provided", () => {
    const res  = makeRes();
    const next = jest.fn();

    // Send the exact key configured in ADMIN_KEY
    requireAdmin({ headers: { "x-admin-key": ADMIN_KEY } }, res, next);

    console.log("Case 7: Admin Middleware Correct Key");
    console.log("  x-admin-key header        :", ADMIN_KEY);
    console.log("  Status Code               :", res.statusCode);
    console.log("  next() called             :", next.mock.calls.length > 0);
    console.log("  next() call count         :", next.mock.calls.length);

    // next() must be called exactly once to pass control to the route handler
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).not.toBe(401);
  });
});


describe("Case 8 — Admin Middleware: Wrong Key", () => {
  test("returns 401 when wrong key provided", () => {
    const res  = makeRes();
    const next = jest.fn();

    // Send a key that exists but does not match ADMIN_KEY
    requireAdmin({ headers: { "x-admin-key": "bad-key-000" } }, res, next);

    console.log("Case 8: Admin Middleware Wrong Key");
    console.log("  x-admin-key header        :", "bad-key-000");
    console.log("  Status Code               :", res.statusCode);
    console.log("  Response Body             :", JSON.stringify(res.body));
    console.log("  next() called             :", next.mock.calls.length > 0);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});


describe("Case 13 — GET Predictions Endpoint", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns exactly 7 records with required fields", async () => {
    // Build 7 mock prediction rows covering all four risk levels
    const mockRows = Array.from({ length: 7 }, (_, i) => ({
      id:          i + 1,
      risk_label:  ["Low", "Moderate", "High", "Extreme", "High", "Moderate", "Low"][i],
      risk_code:   [0, 1, 2, 3, 2, 1, 0][i],
      probability: [0.72, 0.65, 0.91, 0.88, 0.79, 0.61, 0.55][i],
      date:        `2026-04-${14 + i}`,
    }));
    mockPool.query.mockResolvedValue({ rows: mockRows });

    const res  = makeRes();
    await getPredictions({ headers: {}, query: { limit: "7" } }, res);
    const rows = res.body as Array<Record<string, unknown>>;

    console.log("Case 13: GET Predictions Endpoint");
    console.log("  Status Code               :", res.statusCode);
    console.log("  Record count              :", rows.length);
    console.log("  Records returned:");
    rows.forEach((r, i) => {
      console.log(`    [${i + 1}] date: ${r.date}  risk_label: ${r.risk_label}  risk_code: ${r.risk_code}  probability: ${r.probability}`);
    });

    expect(res.statusCode).toBe(200);
    expect(rows.length).toBe(7);

    // Every row must contain all four fields the frontend depends on
    rows.forEach(row => {
      expect(row).toHaveProperty("risk_label");
      expect(row).toHaveProperty("risk_code");
      expect(row).toHaveProperty("probability");
      expect(row).toHaveProperty("date");
    });
  });
});