// board · day-closed — the badge beside the heading (board.md §5 Events; no still).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("day-closed: 'Day closed' is visible", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/board/day-closed`);
  await expect(page.getByText("Day closed")).toBeVisible();
});
