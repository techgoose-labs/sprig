import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// E4 — the reconciled note (reply without `at`) renders undimmed with "just now".
test("saved note reads 'just now', undimmed, badge 1", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/saved`);
  await waitHydrated(page);
  const island = page.locator('sprig-island[data-sel="dog-notes"]');
  const rows = island.locator("li.dog-notes-item");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".dog-notes-text")).toHaveText("Extra blanket at night — he runs cold.");
  await expect(rows.first().locator(".dog-notes-meta")).toHaveText("Front desk · just now");
  await expect(rows.first()).toHaveCSS("opacity", "1");
  await expect(island.locator(".badge")).toHaveText("1");
  await expect(island.locator('input[name="text"]')).toHaveValue("");
});
