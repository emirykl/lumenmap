import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { waitFor } from "@testing-library/dom";
import { vi } from "vitest";
import { useDashboard } from "./DashboardProvider";
import { DetailPanel } from "./DetailPanel";

vi.mock("./DashboardProvider", () => ({ useDashboard: vi.fn() }));

const id = "G" + "A".repeat(55);
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(useDashboard).mockReturnValue({
    selectedNode: { name: "Example account", value: 10, share: 0.1, meta: { type: "account", id } },
    setSelectedNode: vi.fn(),
    setTreemapView: vi.fn(),
    setActiveLevelPath: vi.fn(),
    network: "mainnet",
    readOnly: false,
    metric: "ops",
    isLoading: false,
  } as unknown as ReturnType<typeof useDashboard>);
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

test("shows entity details while first-seen loads, then shows unavailable on lookup failure", async () => {
  let rejectRequest!: (error: Error) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((_resolve, reject) => { rejectRequest = reject; })));
  await act(async () => {
    root.render(<QueryClientProvider client={client}><DetailPanel /></QueryClientProvider>);
  });
  expect(container.textContent).toContain("Example account");
  expect(container.textContent).toContain("First seen");
  expect(container.textContent).toContain("Loading…");

  await act(async () => { rejectRequest(new Error("provider failure")); });
  await waitFor(() => expect(container.textContent).toContain("Unavailable"));
  expect(container.textContent).toContain("Hubble data may lag");
});

test("shows fixed fixture first-seen and age context", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ firstSeenAt: "2024-01-01T00:00:00.000Z", source: "fixture" }),
  })));
  await act(async () => {
    root.render(<QueryClientProvider client={client}><DetailPanel /></QueryClientProvider>);
  });
  await waitFor(() => expect(container.textContent).toContain("Jan 1, 2024"));
  expect(container.textContent).toContain("Age");
  expect(container.textContent).toContain("About ");
});
