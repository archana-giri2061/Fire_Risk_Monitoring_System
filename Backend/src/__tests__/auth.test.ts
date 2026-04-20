// auth.test.ts
// Unit tests for Case 22: requireAdmin middleware.
// Verifies that the x-admin-key header is correctly validated across
// three scenarios: missing key, correct key, and wrong key.
// No database or network calls are needed for these tests.

export {};

// The expected admin key value that the middleware checks against
const ADMIN_KEY = "vanadristi-admin-2026";

// Minimal request shape containing only the headers the middleware reads
interface MockRequest {
  headers: Record<string, string | undefined>;
}

// Minimal response shape that mirrors Express's res.status().json() chaining
interface MockResponse {
  statusCode: number;
  body:       unknown;
  status(code: number): MockResponse;
  json(data: unknown):  MockResponse;
}

// Factory that returns a fresh response object for each test
// so status codes and body values never leak between assertions
function makeMockRes(): MockResponse {
  const res = {
    statusCode: 200,
    body:       null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown)  { this.body = data;        return this; },
  };
  return res;
}

// Middleware that validates the x-admin-key request header.
// Returns 401 and stops the chain if the key is absent or incorrect.
// Calls next() to pass control to the route handler if the key matches.
function requireAdmin(req: MockRequest, res: MockResponse, next: jest.Mock): void {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorised — admin key required" });
    return;
  }
  next();
}


describe("Case 22 — requireAdmin Middleware", () => {

  // Shared next mock — recreated before each test so call counts
  // from one sub-case never affect the assertions in another
  let next: jest.Mock;
  beforeEach(() => {
    next = jest.fn();
  });

  describe("22a: missing x-admin-key header", () => {
    test("returns 401 when header is absent", () => {
      const req: MockRequest = { headers: {} };  // No x-admin-key header present
      const res = makeMockRes();
      requireAdmin(req, res, next);

      console.log("Case 22a: Missing Key");
      console.log("  x-admin-key header  :", req.headers["x-admin-key"] ?? "NOT PROVIDED");
      console.log("  Status Code         :", res.statusCode);
      console.log("  Response Body       :", JSON.stringify(res.body));
      console.log("  next() called       :", next.mock.calls.length > 0);

      expect(res.statusCode).toBe(401);
      // Error message must be exact so the frontend can identify the failure reason
      expect(res.body).toEqual({ error: "Unauthorised — admin key required" });
      // next() must never be called when the key is absent
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("22b: correct x-admin-key header", () => {
    test("calls next() when correct key is provided", () => {
      const req: MockRequest = { headers: { "x-admin-key": ADMIN_KEY } };
      const res = makeMockRes();
      requireAdmin(req, res, next);

      console.log("Case 22b: Correct Key");
      console.log("  x-admin-key header  :", req.headers["x-admin-key"]);
      console.log("  Status Code         :", res.statusCode);
      console.log("  next() called       :", next.mock.calls.length > 0);
      console.log("  next() call count   :", next.mock.calls.length);

      // next() must be called exactly once to pass control to the route handler
      expect(next).toHaveBeenCalledTimes(1);
      // Status code must not be 401 — the default 200 is acceptable here
      expect(res.statusCode).not.toBe(401);
    });
  });

  describe("22c: incorrect x-admin-key header", () => {
    test("returns 401 when wrong key is provided", () => {
      const req: MockRequest = { headers: { "x-admin-key": "wrong-key-999" } };
      const res = makeMockRes();
      requireAdmin(req, res, next);

      console.log("Case 22c: Wrong Key");
      console.log("  x-admin-key header  :", req.headers["x-admin-key"]);
      console.log("  Status Code         :", res.statusCode);
      console.log("  Response Body       :", JSON.stringify(res.body));
      console.log("  next() called       :", next.mock.calls.length > 0);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorised — admin key required" });
      // next() must not be called for an incorrect key, same as a missing key
      expect(next).not.toHaveBeenCalled();
    });
  });
});