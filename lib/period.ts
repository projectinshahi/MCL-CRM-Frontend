// The dashboard's period: all time, the last 7 or 30 India days (today included), or a custom range of days (both
// included). The API works out the preset days itself (GET /dashboard/summary?days=7) and sends them back.
export type Period = { days: 7 | 30 } | { from: string; to: string } | null; // null = all time

export const periodQuery = (p: Period) => (p === null ? undefined : "days" in p ? { days: p.days } : { from: p.from, to: p.to });

export const samePeriod = (a: Period, b: Period) => JSON.stringify(a) === JSON.stringify(b);

const istDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
/** Today in India, "YYYY-MM-DD": the business calendar, wherever the browser is. */
export const todayIST = (now = new Date()) => istDay.format(now);

/** Why a custom range can't be applied (and which field to mark), or null. */
export function rangeProblem(from: string, to: string, today: string): { field: "from" | "to"; message: string } | null {
  if (!from) return { field: "from", message: "Pick a start date" };
  if (!to) return { field: "to", message: "Pick an end date" };
  if (from > to) return { field: "from", message: "The start date is after the end date" };
  if (to > today) return { field: "to", message: "The end date is after today" };
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: MONTHS[m! - 1]!, d: d! };
};

/** "2 Nov 2026", "3 – 9 Nov 2026", "27 Oct – 2 Nov 2026", "28 Dec 2025 – 3 Jan 2026" */
export function daysLabel(from: string, to: string) {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${b.d} ${b.m} ${b.y}`;
  if (a.y !== b.y) return `${a.d} ${a.m} ${a.y} – ${b.d} ${b.m} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${a.m} – ${b.d} ${b.m} ${b.y}`;
  return `${a.d} – ${b.d} ${b.m} ${b.y}`;
}

export const periodLabel = (p: Period) => (p === null ? "All time" : "days" in p ? `Last ${p.days} days` : daysLabel(p.from, p.to));
