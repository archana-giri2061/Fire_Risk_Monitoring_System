// client.ts
// Shared axios instance used by all frontend API modules.
// Reads the backend base URL from Vite environment variables so the same
// build can point at localhost in development and the EC2 IP in production
// without any code changes — only the .env file needs to differ.

import axios from "axios";

// Read the backend URL from either of the two supported env var names and
// strip any trailing slash so API paths like "/api/sensor/all" always join cleanly.
// Falls back to localhost:3000 if neither variable is set, which covers local
// development without a frontend .env file.
const BASE_URL = (
  import.meta.env.VITE_API_URL      ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

// Single shared axios instance imported by alertApi.ts, sensorApi.ts,
// weatherApi.ts, mlApi.ts, and api.ts. Using one instance means base URL,
// headers, and timeout are configured in one place and apply to every request.
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,  // 15 second timeout — long enough for ML prediction routes
                   // which invoke Python subprocesses before responding
});

export default api;