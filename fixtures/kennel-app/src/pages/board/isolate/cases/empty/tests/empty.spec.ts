// board · empty — no dogs today (board.md §5 Events).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("empty: 'No dogs booked today' and the strip shows — four times", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/board/empty`);
  await expect(page.getByText("No dogs booked today")).toBeVisible();
  await expect(page.locator(".status-strip-count")).toHaveText(["—", "—", "—", "—"]);
});
