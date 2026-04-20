// date.ts
// Shared date utility functions used by weather sync and ML pipeline scripts.
// Provides consistent date formatting and range calculation across the codebase.


// Converts a JavaScript Date object to a YYYY-MM-DD string.
// Used wherever an ISO date string is needed for API query parameters,
// database queries, or file naming — avoids repeating this logic inline.
export function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");  // getMonth() is 0-indexed
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


// Returns a start and end date range covering approximately the past 60 days.
// Used by the weather sync service to determine how far back to fetch
// historical archive data from the Open-Meteo Archive API.
// Both dates are returned as YYYY-MM-DD strings ready for use as API parameters.
export function last60DaysRange(): { start_date: string; end_date: string } {
  const end   = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 60);  // Subtract 60 days from today

  return { start_date: toISODate(start), end_date: toISODate(end) };
}