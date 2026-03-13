import { Pool } from "pg";
import "dotenv/config";

const useSSL = process.env.DB_SSL === "true";

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

export async function testDbConnection() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0];
}