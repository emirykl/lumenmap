import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByLabelText, getByRole, getByText } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { WatchlistPanel } from "./WatchlistPanel";

vi.mock("@/components/dashboard/DashboardProvider", () => ({
  useDashboard: () => ({
    data: null,
    period: "1d",
    flowViewEnabled: false,
    focusWatchedEntity: vi.fn(),
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WatchlistPanel import", () => {
  it("imports the sample file, shows skip reasons, and clears imported entries", async () => {
    act(() => root.render(<WatchlistPanel />));
    const file = new File([readFileSync("data/fixtures/watchlist-import.csv")], "watchlist-import.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", {
      value: async () => readFileSync("data/fixtures/watchlist-import.csv", "utf8"),
    });

    await act(async () => {
      fireEvent.change(getByLabelText(container, "Address list file"), {
        target: { files: [file] },
      });
    });
    expect(getByText(container, /Imported 2 address\(es\); skipped 1 row\(s\)/)).toBeTruthy();
    expect(getByText(container, "Row 4: Invalid Stellar account or contract address")).toBeTruthy();
    expect(getByText(container, "2/20 saved in this browser")).toBeTruthy();

    act(() => fireEvent.click(getByRole(container, "button", { name: "Clear imported" })));
    expect(getByText(container, "0/20 saved in this browser")).toBeTruthy();
    expect(getByText(container, "Cleared 2 imported address(es).")).toBeTruthy();
  });

  it("shows the watchlist cap when the file has too many addresses", async () => {
    act(() => root.render(<WatchlistPanel />));
    const addresses = Array.from({ length: 21 }, (_, n) =>
      `G${"A".repeat(54)}${"234567ABCDEFGHIJKLMNOPQRSTUVWXYZ"[n]}`,
    ).join("\n");
    const file = new File([addresses], "addresses.txt", { type: "text/plain" });
    Object.defineProperty(file, "text", { value: async () => addresses });
    await act(async () => {
      fireEvent.change(getByLabelText(container, "Address list file"), {
        target: { files: [file] },
      });
    });
    expect(getByText(container, /1 row\(s\) exceeded the 20-entry limit/)).toBeTruthy();
    expect(getByText(container, "20/20 saved in this browser")).toBeTruthy();
  });
});
