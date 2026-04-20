// auth.middleware.ts
// Express middleware that protects admin-only routes from unauthorised access.
// Applied to routes that trigger sensitive operations such as weather sync,
// model retraining, and manual alert sending.
// The admin key must be set in Backend/.env as ADMIN_API_KEY=your-secret.
// If the env var is not set, the fallback development key is used instead.

import { Request, Response, NextFunction } from "express";

// Read the admin key from the environment at module load time.
// The fallback value allows the app to start without a .env entry during
// local development but must be overridden with a strong secret on EC2.
const ADMIN_KEY = process.env.ADMIN_API_KEY || "vanadristi-admin-2026";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // Accept the key from any of three locations to support different callers:
  //   1. x-admin-key header       — preferred, used by the frontend and Postman
  //   2. Authorization header     — Bearer token format for API client compatibility
  //   3. adminKey query parameter — fallback for quick browser or curl testing
  const key =
    req.headers["x-admin-key"] as string ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query["adminKey"] as string;

  if (!key || key !== ADMIN_KEY) {
    // Return 401 immediately and stop the middleware chain so the
    // route handler never executes for unauthorised requests
    res.status(401).json({
      ok:    false,
      error: "Unauthorized. Admin key required.",
      hint:  "Pass header: x-admin-key: <your key>",  // Shown to help diagnose missing key issues
    });
    return;
  }

  // Key matches — pass control to the next middleware or route handler
  next();
}