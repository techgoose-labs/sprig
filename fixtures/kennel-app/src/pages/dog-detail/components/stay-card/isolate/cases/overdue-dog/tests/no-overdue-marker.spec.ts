import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
// A static unit renders in isolate without its <stay-card> host tag — locators target the unit root .stay-card.

test("d14 overdue dog: the card is unchanged, no overdue marker", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/stay-card/overdue-dog`);
  await expect(page.locator(".stay-card [data-total-due]")).toHaveText("$110.00");
  await expect(page.locator(".stay-card .badge")).toHaveCount(0);
});
