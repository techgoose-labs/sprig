import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const R = `${BASE}/pages/dog-detail/dog-heading`;

test("checked-in: no overdue badge when overdue is false", async ({ page }) => {
  await page.goto(`${R}/checked-in`);
  await waitHydrated(page);
  await expect(page.locator(".badge")).toHaveText(["Checked in"]);
  await expect(page.locator(".badge-error")).toHaveCount(0);
});
