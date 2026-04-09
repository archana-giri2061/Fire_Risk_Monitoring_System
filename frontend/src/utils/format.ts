export function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function toTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}