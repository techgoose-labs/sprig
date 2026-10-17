import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
// A static unit renders in isolate without its <stay-card> host tag — locators target the unit root .stay-card.

test("no stay on file: honest-empty line, no facts, no total", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/stay-card/no-stay`);
  await expect(page.locator(".stay-card p")).toHaveText("No stay on file for this dog.");
  await expect(page.locator(".stay-card [data-total-due]")).toHaveCount(0);
  await expect(page.locator(".stay-card dl")).toHaveCount(0);
});
