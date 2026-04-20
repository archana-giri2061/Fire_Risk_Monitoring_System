// Converts an ISO date string or any value accepted by the Date constructor
// into a short localised date string using the browser's locale settings.
// e.g. "2026-04-20T10:30:00" → "4/20/2026" in en-US
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

// Converts an ISO date string or any value accepted by the Date constructor
// into a localised date and time string using the browser's locale settings.
// e.g. "2026-04-20T10:30:00" → "4/20/2026, 10:30:00 AM" in en-US
export function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

// Converts a snake_case identifier into a human-readable Title Case label.
// First replaces every underscore with a space, then capitalises the first
// letter of each word so it reads naturally as a UI label.
// e.g. "temperature_max" → "Temperature Max"
// e.g. "risk_label"      → "Risk Label"
export function toTitleCase(value: string) {
  return value
    .replace(/_/g, " ")                          // swap underscores for spaces
    .replace(/\b\w/g, (char) => char.toUpperCase()); // capitalise the first letter of every word
}