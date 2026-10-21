import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { FIXTURE_ACCOUNTS } from "@/lib/fixtures/raw-data";
import { GET } from "./route";

afterEach(() => {
  delete process.env.LUMENMAP_DATA_SOURCE;
});

test("route validates entity inputs before querying", async () => {
  const invalid = await GET(new Request("http://localhost/api/v1/entities/first-seen?type=account&id=bad"));
  assert.equal(invalid.status, 400);
  const wrongType = await GET(new Request(`http://localhost/api/v1/entities/first-seen?type=contract&id=${FIXTURE_ACCOUNTS.kraken}`));
  assert.equal(wrongType.status, 400);
});

test("route serves fixed fixture first-seen context", async () => {
  process.env.LUMENMAP_DATA_SOURCE = "fixture";
  const response = await GET(new Request(`http://localhost/api/v1/entities/first-seen?type=account&id=${FIXTURE_ACCOUNTS.kraken}`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { firstSeenAt: "2018-06-12T00:00:00.000Z", source: "fixture" });
});
