export function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Past 2 months (approx) using "today - 60 days"
export function last60DaysRange() {
  const end = new Date();                 // today
  const start = new Date();
  start.setDate(end.getDate() - 60);      // last 60 days

  return { start_date: toISODate(start), end_date: toISODate(end) };
}