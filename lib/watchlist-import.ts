import {
  WATCHLIST_LIMIT,
  addWatchlistEntry,
  normalizeWatchlistAddress,
  resolveWatchlistKind,
  type WatchlistEntry,
} from "@/lib/watchlist";

export type ImportSkip = { row: number; reason: string };

export type WatchlistImportResult = {
  entries: WatchlistEntry[];
  imported: number;
  skipped: ImportSkip[];
};

/** Parse one physical CSV row. A broken row is skipped without losing later rows. */
function parseCsvRow(line: string): string[] | null {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += char;
      }
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
      closed = false;
    } else if (char === '"' && cell === "" && !closed) {
      quoted = true;
    } else if (char === '"' || (closed && char.trim())) {
      return null;
    } else if (!closed) {
      cell += char;
    }
  }
  if (quoted) return null;
  cells.push(cell);
  return cells;
}

export function importWatchlistText(
  text: string,
  format: "csv" | "txt",
  existing: WatchlistEntry[],
): WatchlistImportResult {
  let entries = existing;
  let imported = 0;
  const skipped: ImportSkip[] = [];
  let addressColumn = 0;
  let firstRow = true;

  for (const [index, raw] of text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).entries()) {
    if (!raw.trim()) continue;
    const row = index + 1;
    const cells = format === "csv" ? parseCsvRow(raw) : [raw];
    if (!cells) {
      skipped.push({ row, reason: "Malformed CSV row" });
      continue;
    }
    if (firstRow) {
      firstRow = false;
      const headerIndex = cells.findIndex(
        (cell) => cell.trim().toLowerCase() === "address",
      );
      if (headerIndex !== -1) {
        addressColumn = headerIndex;
        continue;
      }
    }

    const address = normalizeWatchlistAddress(cells[addressColumn] ?? "");
    if (!address) {
      skipped.push({ row, reason: "Missing address" });
    } else if (!resolveWatchlistKind(address)) {
      skipped.push({ row, reason: "Invalid Stellar account or contract address" });
    } else if (entries.some((entry) => entry.address === address)) {
      skipped.push({ row, reason: "Duplicate address" });
    } else if (entries.length >= WATCHLIST_LIMIT) {
      skipped.push({ row, reason: `Watchlist limit of ${WATCHLIST_LIMIT} reached` });
    } else {
      const result = addWatchlistEntry({ address, entries, origin: "import" });
      if (result.ok) {
        entries = result.entries;
        imported += 1;
      } else {
        skipped.push({ row, reason: result.error });
      }
    }
  }

  return { entries, imported, skipped };
}

export function clearImportedEntries(entries: WatchlistEntry[]): WatchlistEntry[] {
  return entries.filter((entry) => entry.origin !== "import");
}
