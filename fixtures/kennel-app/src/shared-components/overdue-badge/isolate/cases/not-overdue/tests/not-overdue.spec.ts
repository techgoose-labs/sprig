import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E4 not overdue renders nothing", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/overdue-badge/not-overdue`);
  await expect(page.locator("span.badge")).toHaveCount(0);
  await expect(page.getByText("Overdue")).toHaveCount(0);
});
