import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
// A static unit renders in isolate without its <stay-card> host tag — locators target the unit root .stay-card.

test("d03 multi-night stay shows 3 nights and $195.00 due", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/stay-card/multi-night`);
  await expect(page.locator(".stay-card [data-total-due]")).toHaveText("$195.00");
  await expect(page.locator(".stay-card dl dd").nth(3)).toHaveText("3");
});
