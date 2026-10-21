import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FIXTURE_ACCOUNTS, FIXTURE_CONTRACTS } from "@/lib/fixtures/raw-data";
import {
  WATCHLIST_LIMIT,
  addWatchlistEntry,
  readWatchlistFromStorage,
  writeWatchlistToStorage,
  type WatchlistEntry,
} from "@/lib/watchlist";
import { clearImportedEntries, importWatchlistText } from "./watchlist-import";

describe("address list import", () => {
  it("imports the checked-in CSV fixture and reports invalid rows", () => {
    const csv = readFileSync("data/fixtures/watchlist-import.csv", "utf8");
    const result = importWatchlistText(csv, "csv", []);
    assert.equal(result.imported, 2);
    assert.deepEqual(result.entries.map((entry) => entry.address), [
      FIXTURE_ACCOUNTS.kraken,
      FIXTURE_CONTRACTS.soroswap,
    ]);
    assert.deepEqual(result.skipped, [
      { row: 4, reason: "Invalid Stellar account or contract address" },
    ]);
  });

  it("reads a named address column, quotes, BOM, CRLF, and TXT rows", () => {
    const csv = `\uFEFFnote,address\r\n"quoted, note","${FIXTURE_ACCOUNTS.kraken.toLowerCase()}"\r\n`;
    const result = importWatchlistText(csv, "csv", []);
    assert.equal(result.imported, 1);
    assert.equal(result.entries[0].address, FIXTURE_ACCOUNTS.kraken);

    const txt = importWatchlistText(
      `address\n${FIXTURE_CONTRACTS.soroswap}\nbad\n${FIXTURE_CONTRACTS.soroswap}\n`,
      "txt",
      [],
    );
    assert.equal(txt.imported, 1);
    assert.deepEqual(txt.skipped.map((skip) => skip.reason), [
      "Invalid Stellar account or contract address",
      "Duplicate address",
    ]);
  });

  it("skips malformed and missing rows while preserving valid later rows", () => {
    const result = importWatchlistText(
      `address,note\n"unclosed,note\n,empty\n${FIXTURE_ACCOUNTS.kraken},valid`,
      "csv",
      [],
    );
    assert.equal(result.imported, 1);
    assert.deepEqual(result.skipped, [
      { row: 2, reason: "Malformed CSV row" },
      { row: 3, reason: "Missing address" },
    ]);
  });

  it("uses the first column without a CSV header and preserves import origin in storage", () => {
    const result = importWatchlistText(`${FIXTURE_ACCOUNTS.kraken},research note`, "csv", []);
    assert.equal(result.imported, 1);
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    writeWatchlistToStorage(result.entries, storage);
    assert.equal(readWatchlistFromStorage(storage)[0].origin, "import");
    assert.deepEqual(clearImportedEntries(readWatchlistFromStorage(storage)), []);
  });

  it("enforces the existing watchlist cap and clears only imported entries", () => {
    const manual = addWatchlistEntry({ address: FIXTURE_ACCOUNTS.kraken, entries: [] });
    assert.equal(manual.ok, true);
    if (!manual.ok) return;
    const rows = Array.from({ length: WATCHLIST_LIMIT + 1 }, (_, n) =>
      `G${"A".repeat(54)}${"234567ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n]}`,
    );
    const result = importWatchlistText(rows.join("\n"), "txt", manual.entries);
    assert.equal(result.imported, WATCHLIST_LIMIT - 1);
    assert.equal(result.entries.length, WATCHLIST_LIMIT);
    assert.equal(result.skipped.length, 2);
    assert.equal(result.skipped[0].reason, `Watchlist limit of ${WATCHLIST_LIMIT} reached`);
    assert.deepEqual(clearImportedEntries(result.entries), manual.entries);
    assert.equal(result.entries.filter((entry: WatchlistEntry) => entry.origin === "import").length, 19);
  });
});
