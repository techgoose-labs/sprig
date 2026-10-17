// board · default — content assertions (board.md §5 Events).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("default: h1, formatted date, 32 dog cards, no Day closed", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/board/default`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today's dogs");
  await expect(page.getByText("Tuesday, September 29", { exact: true })).toBeVisible();
  await expect(page.locator("a.dog-card-root")).toHaveCount(32);
  await expect(page.getByText("Day closed")).toHaveCount(0);
});
