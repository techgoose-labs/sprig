import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E2: clicking the active non-all tab resets the filter to all", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/status-filter-tabs/walking`);
  await expect(page.locator("a#sft-walking")).toHaveAttribute("href", "?status=all");
  await page.locator("a#sft-walking").click();
  await expect(page).toHaveURL(/[?&]status=all\b/);
});
