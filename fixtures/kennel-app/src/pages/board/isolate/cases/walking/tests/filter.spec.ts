// board · walking — the ?status=walking render (board.md §5 Events).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("walking: Walking tab active, active strip card links back to all, 5 cards", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/board/walking`);
  await expect(page.locator('[role="tablist"] [aria-selected="true"]')).toHaveText("Walking");
  await expect(page.locator('#status-strip-walking')).toHaveAttribute("href", /status=all/);
  await expect(page.locator("a.dog-card-root")).toHaveCount(5);
});
