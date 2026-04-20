// config.ts
// Exports the resolved backend base URL for use by frontend modules that
// build fetch URLs manually rather than using the shared axios instance.
// Reads from the same environment variables as client.ts so both always
// point at the same backend regardless of the deployment environment.

// Resolves the backend base URL from Vite environment variables.
// VITE_API_URL is checked first, then VITE_API_BASE_URL as a fallback,
// then localhost:3000 for local development without a frontend .env file.
// The trailing slash is stripped so paths like "/api/ml/metrics" always join cleanly.
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL      ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");