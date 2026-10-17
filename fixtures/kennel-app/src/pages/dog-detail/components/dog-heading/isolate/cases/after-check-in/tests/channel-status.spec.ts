import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const R = `${BASE}/pages/dog-detail/dog-heading`;

test("after-check-in: renders the dog channel value, not the SSR booked seed", async ({ page }) => {
  await page.goto(`${R}/after-check-in`);
  await waitHydrated(page);
  await expect(page.locator(".badge.badge-success.badge-soft")).toHaveText("Checked in");
  await expect(page.locator(".badge-info")).toHaveCount(0);
});
