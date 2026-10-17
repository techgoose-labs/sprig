// Honest empty: the italic line, no list.
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("empty list renders the honest-empty line", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/overdue-pickups/empty`);
  const card = page.locator("section.overdue-pickups-card");
  await expect(card).toContainText("No overdue pickups — every owner is on time.");
  await expect(card.locator("ul")).toHaveCount(0);
});
