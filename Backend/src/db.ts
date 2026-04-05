import path from "path";
import dotenv from "dotenv";

// Explicitly point to Backend/.env regardless of working directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
    "Make sure Backend/.env exists and contains:\n" +
    "DATABASE_URL=postgresql://postgres:23048573@localhost:5432/Weather_db"
  );
}

const isProduction = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

export async function testDbConnection() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}