// db.ts
// Creates and exports the PostgreSQL connection pool used by all route handlers
// and services. Fails immediately at startup if DATABASE_URL is not set so the
// error is obvious rather than surfacing later as a cryptic connection failure.

import path   from "path";
import dotenv from "dotenv";

// Load Backend/.env using an absolute path so the correct file is found
// regardless of the working directory the server is started from
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { Pool } from "pg";

// Throw a descriptive error at module load time if the connection string is missing.
// This causes the server to refuse to start rather than running in a broken state
// where every database query fails with a less helpful error.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
    "Make sure Backend/.env exists and contains:\n" +
    "DATABASE_URL=postgresql://postgres:<password>@localhost:5432/Weather_db",
  );
}

// In production (NODE_ENV=production), SSL is enabled with certificate verification
// disabled. This is necessary for managed PostgreSQL services like AWS RDS which
// use self-signed certificates that strict hostname checking would reject.
// In development, SSL is disabled to match a typical local PostgreSQL setup.
const isProduction = process.env.NODE_ENV === "production";

// Single shared pool instance used across the entire application.
// pg's Pool manages a set of reusable connections and handles reconnection
// automatically, so this one export serves all concurrent requests safely.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// Runs a minimal query to verify the database connection is working.
// Called by GET /api/weather/db-test to confirm connectivity without
// requiring any application tables to exist.
export async function testDbConnection() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}