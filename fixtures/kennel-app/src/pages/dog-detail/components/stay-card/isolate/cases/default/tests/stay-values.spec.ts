import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
// A static unit renders in isolate without its <stay-card> host tag — locators target the unit root .stay-card.

test("d01 stay shows its facts and the server's total due", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/stay-card/default`);
  await expect(page.locator(".stay-card dl dd")).toHaveText(["Sep 29, 7:00 AM", "Sep 30, 11:00 AM", "$45.00", "1"]);
  await expect(page.locator(".stay-card [data-total-due]")).toHaveText("$45.00");
});
