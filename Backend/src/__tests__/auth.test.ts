// UT-24, UT-25, UT-26
// Tests: Admin middleware — missing key, correct key, wrong key

const mockNext = jest.fn();

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

const requireAdmin = (req: any, res: any, next: any) => {
  const ADMIN_KEY = "vanadristi-admin-2026";
  const key = req.headers?.["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorised — admin key required",
    });
  }
  next();
};

describe("UT-24, UT-25, UT-26 — requireAdmin middleware", () => {

  beforeEach(() => {
    mockNext.mockClear();
  });

  // UT-24 — missing key returns 401
  test("UT-24: returns 401 when x-admin-key header is missing", () => {
    const req: any = { headers: {} };
    const res = mockRes();
    requireAdmin(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  // UT-25 — correct key calls next()
  test("UT-25: calls next() when correct admin key is provided", () => {
    const req: any = {
      headers: { "x-admin-key": "vanadristi-admin-2026" },
    };
    const res = mockRes();
    requireAdmin(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // UT-26 — wrong key returns 401
  test("UT-26: returns 401 when wrong admin key is provided", () => {
    const req: any = {
      headers: { "x-admin-key": "wrongkey123" },
    };
    const res = mockRes();
    requireAdmin(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

});