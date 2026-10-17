import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E1 renders 45m duration", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/overdue-badge/overdue-45m`);
  await expect(page.locator("span.badge.badge-error")).toHaveText("Overdue · 45m");
});
