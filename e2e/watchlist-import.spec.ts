import path from "node:path";
import { expect, test } from "@playwright/test";

test("imports the sample address list and clears its entries", async ({ page, context }) => {
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(url) || url.startsWith("data:")) {
      return route.continue();
    }
    return route.abort();
  });

  await page.goto("/");
  const watchlist = page.getByRole("region", { name: "Wallet watchlist" });
  await expect(watchlist).toBeVisible();
  await watchlist.getByLabel("Address list file").setInputFiles(
    path.resolve("data/fixtures/watchlist-import.csv"),
  );
  await expect(watchlist.getByRole("status").filter({ hasText: "Imported 2 address(es)" })).toBeVisible();
  await expect(watchlist.getByText("Row 4: Invalid Stellar account or contract address")).toBeVisible();
  await expect(watchlist.getByText("2/20 saved in this browser")).toBeVisible();

  await watchlist.getByRole("button", { name: "Clear imported" }).click();
  await expect(watchlist.getByText("0/20 saved in this browser")).toBeVisible();
  await expect(watchlist.getByRole("status").filter({ hasText: "Cleared 2 imported address(es)" })).toBeVisible();
});
