/**
 * api.ts — Central API configuration
 *
 * Automatically picks the right backend URL:
 *  • Production (Render) → https://fire-risk-monitoring-system-1.onrender.com
 *  • Local dev           → http://localhost:3000
 *
 * Used by all pages: import { API } from "../api"
 */

export const API: string =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

/** Typed fetch with error handling */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}