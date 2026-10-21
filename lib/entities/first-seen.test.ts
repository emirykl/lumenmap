import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearCache } from "@/lib/hubble/cache";
import { FIXTURE_ACCOUNTS } from "@/lib/fixtures/raw-data";
import { firstSeenBytesBilledLimit, firstSeenQuery, loadFirstSeen } from "./first-seen-data";
import { formatEntityAge, formatFirstSeen } from "./first-seen";

afterEach(() => {
  clearCache();
  delete process.env.LUMENMAP_DATA_SOURCE;
  delete process.env.BIGQUERY_MAX_BYTES_BILLED;
});

test("formats UTC first-seen dates and approximate age without inventing missing dates", () => {
  assert.equal(formatFirstSeen("2024-01-01T23:00:00.000Z"), "Jan 1, 2024");
  assert.equal(formatEntityAge("2024-01-01T00:00:00.000Z", new Date("2024-01-02T00:00:00.000Z")), "About 1 day");
  assert.equal(formatEntityAge("2024-01-01T00:00:00.000Z", new Date("2025-01-02T00:00:00.000Z")), "About 1 year");
  assert.equal(formatFirstSeen(null), "Unavailable");
  assert.equal(formatEntityAge(null), "Unavailable");
  assert.equal(formatFirstSeen("bad"), "Unavailable");
  assert.equal(formatEntityAge("2025-01-01", new Date("2024-01-01")), "Unavailable");
});

test("queries known Hubble time and entity columns with a bounded time predicate", () => {
  const account = firstSeenQuery("account", "crypto-stellar.crypto_stellar_dbt");
  const contract = firstSeenQuery("contract", "crypto-stellar.crypto_stellar_dbt");
  assert.match(account, /MIN\(closed_at\)/);
  assert.match(account, /op_source_account = @id/);
  assert.match(contract, /MIN\(hour_agg\)/);
  assert.match(contract, /contract_id = @id/);
  assert.match(account, /@start <= closed_at AND closed_at < @end/);
  assert.throws(() => firstSeenQuery("account", "bad`dataset"));
});

test("optional lookup never exceeds the configured or one-gigabyte query cap", () => {
  process.env.BIGQUERY_MAX_BYTES_BILLED = "5000000";
  assert.equal(firstSeenBytesBilledLimit(), 5_000_000);
  process.env.BIGQUERY_MAX_BYTES_BILLED = "5000000000";
  assert.equal(firstSeenBytesBilledLimit(), 1_073_741_824);
});

test("fixtures have fixed first-seen values and unknown entities remain unavailable", async () => {
  process.env.LUMENMAP_DATA_SOURCE = "fixture";
  const known = await loadFirstSeen("account", FIXTURE_ACCOUNTS.kraken, "mainnet");
  assert.equal(known.firstSeenAt, "2018-06-12T00:00:00.000Z");
  assert.equal(known.source, "fixture");
  assert.equal((await loadFirstSeen("account", "G" + "A".repeat(55), "mainnet")).firstSeenAt, null);
});

test("live lookup soft-fails and caches both successful and unavailable results", async () => {
  let calls = 0;
  const id = "G" + "B".repeat(55);
  const good = await loadFirstSeen("account", id, "mainnet", async (_sql, params) => {
    calls++;
    assert.equal(params.id, id);
    return [{ first_seen_at: { value: "2020-04-05T00:00:00.000Z" } }];
  });
  assert.equal(good.firstSeenAt, "2020-04-05T00:00:00.000Z");
  await loadFirstSeen("account", id, "mainnet", async () => { calls++; return []; });
  assert.equal(calls, 1);

  const missingId = "G" + "C".repeat(55);
  const missing = await loadFirstSeen("account", missingId, "mainnet", async () => {
    calls++;
    throw new Error("provider details");
  });
  assert.equal(missing.firstSeenAt, null);
  await loadFirstSeen("account", missingId, "mainnet", async () => { calls++; return []; });
  assert.equal(calls, 2);
});
