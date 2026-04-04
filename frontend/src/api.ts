/**
 * api.ts — Central API URL for all pages
 * Place this at: frontend/src/api.ts
 */
export const API: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:3000";