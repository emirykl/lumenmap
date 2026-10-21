import { buildTimeseries } from "@/lib/hubble/activity";
import { resolvePeriod } from "@/lib/periods";
import type { ActivityTimeseries, Period } from "@/lib/types";
import { FIXTURE_PERIOD_MULTIPLIERS } from "@/lib/fixtures/raw-data";
import { getFixtureTimeseriesRawRows } from "@/lib/fixtures/timeseries-raw";
export { getFixtureTimeseriesRawRows } from "@/lib/fixtures/timeseries-raw";

export function getFixtureTimeseries(period: Period, now = new Date()): ActivityTimeseries {
  const range = resolvePeriod(period, now);
  const rawRows = getFixtureTimeseriesRawRows(period, range.start, range.end);
  return buildTimeseries(period, range.start, range.end, rawRows, now);
}

/** Deterministic active wallet counts for fixture KPI wiring. */
export function getFixtureActiveWalletCount(period: Period): number {
  return 12_500 * FIXTURE_PERIOD_MULTIPLIERS[period];
}

export function getFixtureActiveDestinationCount(period: Period): number {
  return 9_800 * FIXTURE_PERIOD_MULTIPLIERS[period];
}
