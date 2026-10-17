import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("filter-walking: 5 cards", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-grid/filter-walking`);
  await expect(page.locator(".dog-grid-list a.dog-card-root")).toHaveCount(5);
});
