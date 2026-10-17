// board · default — every interaction is a link (board.md §5 Events).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("default: strip cards link to ?status=, tab All active, card opens dog detail", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/board/default`);
  await expect(page.locator('#status-strip-walking')).toHaveAttribute("href", /status=walking/);
  await expect(page.locator('a[href*="status=walking"]').first()).toBeVisible();
  await expect(page.locator('[role="tablist"] [aria-selected="true"]')).toHaveText("All");
  await expect(page.locator("a.dog-card-root").first()).toHaveAttribute("href", /\/dog\/d01$/);
});
