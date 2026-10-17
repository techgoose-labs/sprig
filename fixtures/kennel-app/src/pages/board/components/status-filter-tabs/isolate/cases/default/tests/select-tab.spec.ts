import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL = `${BASE}/pages/board/status-filter-tabs/default`;

test("E1: clicking an inactive tab navigates to its ?status=", async ({ page }) => {
  await page.goto(URL);
  await page.locator("a#sft-walking").click();
  await expect(page).toHaveURL(/[?&]status=walking\b/);
});

test("E3: clicking the active All tab keeps status=all", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("a#sft-all")).toHaveClass(/\btab-active\b/);
  await page.locator("a#sft-all").click();
  await expect(page).toHaveURL(/[?&]status=all\b/);
});
