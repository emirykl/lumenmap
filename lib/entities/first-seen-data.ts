import { getBigQueryClient } from "@/lib/hubble/client";
import { getCached, setCache } from "@/lib/hubble/cache";
import { getMaxBytesBilledLimit } from "@/lib/hubble/config";
import { extractTotalBytesBilled, recordBytesBilled } from "@/lib/hubble/bytes-billed-telemetry";
import { coalesceInflight } from "@/lib/hubble/inflight";
import { resolveDataSource } from "@/lib/data-source";
import { resolveHubbleDataset, type DashboardNetworkId } from "@/lib/network";
import { FIXTURE_ACCOUNTS, FIXTURE_CONTRACTS } from "@/lib/fixtures/raw-data";
import type { FirstSeenContext } from "@/lib/entities/first-seen";

export type FirstSeenEntityType = "account" | "contract";
type FirstSeenRow = { first_seen_at?: { value?: string } | string | null };
type QueryRunner = (query: string, params: { id: string; start: string; end: string }) => Promise<FirstSeenRow[]>;

const fixtureDates: Record<string, string> = {
  [FIXTURE_ACCOUNTS.kraken]: "2018-06-12T00:00:00.000Z",
  [FIXTURE_ACCOUNTS.lobstr]: "2019-03-04T00:00:00.000Z",
  [FIXTURE_ACCOUNTS.moneygram]: "2022-08-15T00:00:00.000Z",
  [FIXTURE_ACCOUNTS.unknownA]: "2024-01-10T00:00:00.000Z",
  [FIXTURE_ACCOUNTS.unknownB]: "2024-02-20T00:00:00.000Z",
  [FIXTURE_ACCOUNTS.unknownC]: "2024-03-30T00:00:00.000Z",
  [FIXTURE_CONTRACTS.soroswap]: "2023-07-20T00:00:00.000Z",
  [FIXTURE_CONTRACTS.soroswapPool]: "2023-08-02T00:00:00.000Z",
  [FIXTURE_CONTRACTS.soroswapRouter]: "2023-08-03T00:00:00.000Z",
  [FIXTURE_CONTRACTS.unknown]: "2024-04-11T00:00:00.000Z",
};

const inflight = new Map<string, Promise<FirstSeenContext>>();
const UNAVAILABLE: FirstSeenContext = { firstSeenAt: null, source: "hubble" };
const FIRST_SEEN_MAX_BYTES_BILLED = 1_073_741_824;

export function firstSeenBytesBilledLimit(): number {
  return Math.min(getMaxBytesBilledLimit(), FIRST_SEEN_MAX_BYTES_BILLED);
}

export function firstSeenQuery(type: FirstSeenEntityType, dataset: string): string {
  // Dataset names are identifiers and cannot be parameterized by BigQuery.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+$/.test(dataset)) {
    throw new Error("Invalid Hubble dataset");
  }
  const table = type === "account" ? "enriched_history_operations" : "hourly_soroban_fee_agg_contract";
  const time = type === "account" ? "closed_at" : "hour_agg";
  const id = type === "account" ? "op_source_account" : "contract_id";
  return `SELECT MIN(${time}) AS first_seen_at FROM \`${dataset}.${table}\` WHERE @start <= ${time} AND ${time} < @end AND ${id} = @id`;
}

async function runLiveQuery(query: string, params: { id: string; start: string; end: string }): Promise<FirstSeenRow[]> {
  const client = getBigQueryClient();
  if (!client) throw new Error("BigQuery client is not configured");
  const [job] = await client.createQueryJob({
    query,
    params,
    maximumBytesBilled: firstSeenBytesBilledLimit().toString(),
  });
  const [rows] = await job.getQueryResults();
  try {
    const [metadata] = await job.getMetadata();
    recordBytesBilled(extractTotalBytesBilled(metadata));
  } catch {
    // Telemetry cannot affect this optional panel field.
  }
  return rows as FirstSeenRow[];
}

export async function loadFirstSeen(
  type: FirstSeenEntityType,
  id: string,
  network: DashboardNetworkId,
  runQuery: QueryRunner = runLiveQuery,
): Promise<FirstSeenContext> {
  try {
    if (resolveDataSource() === "fixture") {
      return { firstSeenAt: fixtureDates[id] ?? null, source: "fixture" };
    }
    const dataset = resolveHubbleDataset(network);
    const query = firstSeenQuery(type, dataset);
    const key = `first-seen:v1:${network}:${type}:${id}`;
    const cached = getCached<FirstSeenContext>(key);
    if (cached) return cached;
    return coalesceInflight(inflight, key, async () => {
      let result = UNAVAILABLE;
      try {
        const rows = await runQuery(query, {
          id,
          start: type === "account" ? "2015-01-01T00:00:00.000Z" : "2023-01-01T00:00:00.000Z",
          end: new Date().toISOString(),
        });
        const raw = rows[0]?.first_seen_at;
        const value = typeof raw === "string" ? raw : raw?.value;
        if (value && Number.isFinite(new Date(value).getTime())) {
          result = { firstSeenAt: new Date(value).toISOString(), source: "hubble" };
        }
      } catch {
        // Query limits, schema drift, and provider errors all leave this optional field unavailable.
      }
      setCache(key, result, result.firstSeenAt ? 86_400 : 900);
      return result;
    });
  } catch {
    return UNAVAILABLE;
  }
}
