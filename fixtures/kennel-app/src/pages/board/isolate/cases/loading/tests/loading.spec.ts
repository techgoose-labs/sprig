// board · loading — the board-owned skeleton (board.md §5 Events, §8 A11y).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("loading: status text, aria-busy, 4 strip + 8 card skeletons (36 blocks)", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/board/loading`);
  await expect(page.getByRole("status")).toHaveText("Loading today's dogs…");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(1);
  await expect(page.locator(".board-skel-strip .skeleton")).toHaveCount(4);
  await expect(page.locator(".board-skel-grid > .card")).toHaveCount(8);
  await expect(page.locator(".board-loading .skeleton")).toHaveCount(36);
});
