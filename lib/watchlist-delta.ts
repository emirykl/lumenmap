import { getFixtureRawActivity } from "@/lib/fixtures/raw-data";
import { getFixtureTimeseriesRawRows } from "@/lib/fixtures/timeseries-raw";
import { resolvePeriod } from "@/lib/periods";
import { addDays, addHours, startOfDay, startOfHour } from "date-fns";
import type { Period, TimeseriesBucket, TreemapNode } from "@/lib/types";

export type WatchlistDelta = {
  /** Operation count for the active period. Null when it cannot be observed. */
  opCount: number | null;
  /** Operations in the previous equal-length window, when that window exists. */
  previousOps: number | null;
  /**
   * Percent change of the active window versus the previous equal-length
   * window. Null when the previous window is missing or its count is zero.
   */
  deltaPercent: number | null;
};

export function sumBucketOperations(
  buckets: readonly Pick<TimeseriesBucket, "operations">[] | null | undefined,
): number {
  if (!buckets) return 0;
  return buckets.reduce((total, bucket) => total + bucket.operations, 0);
}

/**
 * Percent change of `currentOps` against `previousOps`.
 * A zero or missing previous window has no meaningful percent.
 */
export function activityDeltaPercent(
  currentOps: number,
  previousOps: number | null,
): number | null {
  if (previousOps === null || previousOps === 0) return null;
  return ((currentOps - previousOps) / previousOps) * 100;
}

/**
 * Scale an entity's active-period count by the ratio of two timeseries
 * windows. Returns null when the active window total is zero.
 */
export function scalePreviousOps(
  currentOps: number,
  currentWindowTotal: number,
  previousWindowTotal: number,
): number | null {
  if (currentWindowTotal <= 0) return null;
  return Math.round(currentOps * (previousWindowTotal / currentWindowTotal));
}

/**
 * Instant that falls inside the equal-length window immediately before
 * `period` as resolved at `now`.
 */
export function previousEqualAnchor(period: Period, now: Date): Date {
  const current = resolvePeriod(period, now);
  const durationMs = current.end.getTime() - current.start.getTime() + 1;
  return new Date(current.start.getTime() - Math.max(1, Math.floor(durationMs / 2)));
}

export function formatActivityDelta(percent: number | null): string {
  if (percent === null || Number.isNaN(percent)) return "n/a";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

function sumLeafOps(root: TreemapNode | null | undefined, address: string): number | null {
  if (!root) return null;
  let found = false;
  let total = 0;

  const walk = (node: TreemapNode) => {
    const children = node.children ?? [];
    if (children.length === 0) {
      const id = node.meta?.id ?? node.id;
      if (id === address) {
        found = true;
        const raw = node.meta?.opCount ?? node.value ?? 0;
        total += Number(raw) || 0;
      }
      return;
    }
    for (const child of children) walk(child);
  };

  walk(root);
  return found ? total : null;
}

export function lookupTreemapOps(
  treemaps: { actors?: TreemapNode; events?: TreemapNode } | null | undefined,
  address: string,
  kind: "account" | "contract",
): number | null {
  const root = kind === "account" ? treemaps?.actors : treemaps?.events;
  return sumLeafOps(root, address);
}

function fixtureEntityOps(address: string, period: Period): number {
  const raw = getFixtureRawActivity(period);
  const accountOps = raw.accounts
    .filter((row) => row.account_id === address)
    .reduce((total, row) => total + row.op_count, 0);
  const contractOps = raw.contracts
    .filter((row) => row.contract_id === address)
    .reduce((total, row) => total + row.op_count, 0);
  return accountOps + contractOps;
}

function fixtureWindowOps(period: Period, now: Date): number {
  const { start, end } = resolvePeriod(period, now);
  const hourly = period === "1d";
  const totals = new Map<string, number>();
  for (const row of getFixtureTimeseriesRawRows(period, start, end)) {
    const key = row.bucket_time.slice(0, hourly ? 13 : 10);
    totals.set(key, (totals.get(key) ?? 0) + row.op_count);
  }

  let total = 0;
  let buckets = 0;
  let current = hourly ? startOfHour(start) : startOfDay(start);
  while (current <= end) {
    const include = hourly
      ? current <= now || buckets === 0 || current <= addHours(now, 1)
      : current <= startOfDay(now) || buckets === 0 || current <= now;
    if (include) {
      total += totals.get(current.toISOString().slice(0, hourly ? 13 : 10)) ?? 0;
      buckets += 1;
    }
    current = hourly ? addHours(current, 1) : addDays(current, 1);
  }
  return total;
}

/**
 * Fixture mode delta. Entity counts come from the fixture activity rows
 * (scaled by the period multiplier). The previous equal-length window is
 * the fixture timeseries anchored just before the active period, so the
 * percent is stable for a given address, period, and clock.
 */
export function fixtureWatchlistDelta(
  address: string,
  period: Period,
  now = new Date(),
): WatchlistDelta {
  const opCount = fixtureEntityOps(address, period);
  const currentTotal = fixtureWindowOps(period, now);
  const previousTotal = fixtureWindowOps(period, previousEqualAnchor(period, now));
  const previousOps = scalePreviousOps(opCount, currentTotal, previousTotal);

  return {
    opCount,
    previousOps,
    deltaPercent: activityDeltaPercent(opCount, previousOps),
  };
}

export function resolveWatchlistBadge(input: {
  address: string;
  kind: "account" | "contract";
  period: Period;
  source?: string | null;
  now?: Date;
  treemaps?: { actors?: TreemapNode; events?: TreemapNode } | null;
}): WatchlistDelta {
  if (input.source === "fixture") {
    return fixtureWatchlistDelta(input.address, input.period, input.now);
  }

  return {
    opCount: lookupTreemapOps(input.treemaps, input.address, input.kind),
    previousOps: null,
    deltaPercent: null,
  };
}
