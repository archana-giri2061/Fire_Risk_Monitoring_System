// alertApi.ts
// Frontend API client functions for triggering fire risk alert emails.
// Calls the Express backend alert routes via the shared axios instance in client.ts.

import api from "./client";


// Triggers the run-email alert pipeline on the backend.
// The backend queries the next 7 days of predictions and sends an alert email
// if any High or Extreme risk days are found.
// Used by the frontend Quick Actions panel to manually trigger an alert check.
export async function runEmailAlerts() {
  const res = await api.post("/api/alerts/run-email");
  return res.data;
}