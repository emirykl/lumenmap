import type { Period, TimeseriesRawRow } from "@/lib/types";
import { FIXTURE_PERIOD_MULTIPLIERS } from "@/lib/fixtures/raw-data";

/** Base hourly pattern for a single UTC day (operations / transactions). */
const BASE_HOURLY_PATTERN: { hour: number; tx_count: number; op_count: number }[] =
  [
    { hour: 0, tx_count: 800, op_count: 2_400 },
    { hour: 1, tx_count: 600, op_count: 1_800 },
    { hour: 2, tx_count: 0, op_count: 0 },
    { hour: 3, tx_count: 400, op_count: 1_200 },
    { hour: 8, tx_count: 2_500, op_count: 7_500 },
    { hour: 12, tx_count: 4_200, op_count: 12_600 },
    { hour: 14, tx_count: 3_100, op_count: 9_300 },
    { hour: 18, tx_count: 3_800, op_count: 11_400 },
    { hour: 22, tx_count: 1_900, op_count: 5_700 },
  ];

/** Deterministic daily pattern with zero, high, and moderate days. */
const BASE_DAILY_PATTERN: { dayOffset: number; tx_count: number; op_count: number }[] =
  [
    { dayOffset: 0, tx_count: 45_000, op_count: 135_000 },
    { dayOffset: 1, tx_count: 52_000, op_count: 156_000 },
    { dayOffset: 2, tx_count: 0, op_count: 0 },
    { dayOffset: 3, tx_count: 38_000, op_count: 114_000 },
    { dayOffset: 4, tx_count: 120_000, op_count: 360_000 },
    { dayOffset: 5, tx_count: 41_000, op_count: 123_000 },
    { dayOffset: 6, tx_count: 48_000, op_count: 144_000 },
  ];

function scale(value: number, multiplier: number): number {
  return Math.round(value * multiplier);
}

function buildHourlyRawRows(start: Date, multiplier: number): TimeseriesRawRow[] {
  const dayStart = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );

  return BASE_HOURLY_PATTERN.map(({ hour, tx_count, op_count }) => {
    const bucket = new Date(dayStart.getTime() + hour * 3_600_000);
    return {
      bucket_time: bucket.toISOString(),
      tx_count: scale(tx_count, multiplier),
      op_count: scale(op_count, multiplier),
    };
  });
}

function buildDailyRawRows(start: Date, dayCount: number, multiplier: number): TimeseriesRawRow[] {
  const rows: TimeseriesRawRow[] = [];

  for (let i = 0; i < dayCount; i++) {
    const pattern = BASE_DAILY_PATTERN[i % BASE_DAILY_PATTERN.length];
    const bucket = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + i,
      ),
    );
    rows.push({
      bucket_time: bucket.toISOString(),
      tx_count: scale(pattern.tx_count, multiplier),
      op_count: scale(pattern.op_count, multiplier),
    });
  }

  return rows;
}

function periodDayCount(period: Period, start: Date, end: Date): number {
  if (period === "1d") {
    return 1;
  }
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

export function getFixtureTimeseriesRawRows(
  period: Period,
  start: Date,
  end: Date,
): TimeseriesRawRow[] {
  const multiplier = FIXTURE_PERIOD_MULTIPLIERS[period];

  if (period === "1d") {
    return buildHourlyRawRows(start, multiplier);
  }

  return buildDailyRawRows(start, periodDayCount(period, start, end), multiplier);
}

