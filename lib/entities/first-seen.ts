export interface FirstSeenContext {
  firstSeenAt: string | null;
  source: "hubble" | "fixture";
}

/** Dates are approximate: Hubble's earliest observed activity can lag creation. */
export function formatFirstSeen(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatEntityAge(value: string | null, now = new Date()): string {
  if (!value) return "Unavailable";
  const first = new Date(value).getTime();
  const elapsed = now.getTime() - first;
  if (!Number.isFinite(first) || !Number.isFinite(elapsed) || elapsed < 0) {
    return "Unavailable";
  }
  const days = Math.floor(elapsed / 86_400_000);
  if (days >= 365) return `About ${Math.floor(days / 365)} ${Math.floor(days / 365) === 1 ? "year" : "years"}`;
  if (days >= 30) return `About ${Math.floor(days / 30)} ${Math.floor(days / 30) === 1 ? "month" : "months"}`;
  if (days >= 1) return `About ${days} ${days === 1 ? "day" : "days"}`;
  return "Less than a day";
}
