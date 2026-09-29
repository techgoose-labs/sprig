import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const R = `${BASE}/pages/dog-detail/dog-heading`;

test("overdue: error badge carries overdueBy", async ({ page }) => {
  await page.goto(`${R}/overdue`);
  await waitHydrated(page);
  await expect(page.locator(".badge.badge-error")).toHaveText("Overdue · 2h 15m");
});
