/**
 * auth.middleware.ts
 * Protects admin-only routes (sync, retrain, send alerts).
 * Add ADMIN_API_KEY=your-secret to your .env file on EC2.
 */
import { Request, Response, NextFunction } from "express";

const ADMIN_KEY = process.env.ADMIN_API_KEY || "vanadristi-admin-2026";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const key =
    req.headers["x-admin-key"] as string ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query["adminKey"] as string;

  if (!key || key !== ADMIN_KEY) {
    res.status(401).json({
      ok:    false,
      error: "Unauthorized. Admin key required.",
      hint:  "Pass header: x-admin-key: <your key>",
    });
    return;
  }
  next();
}