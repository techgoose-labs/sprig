import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("empty-day: honest-empty heading, no cards", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-grid/empty-day`);
  await expect(page.getByRole("heading", { name: "No dogs booked today" })).toBeVisible();
  await expect(page.getByText("When a booking lands for today it shows up here, ready to check in.")).toBeVisible();
  await expect(page.locator("a.dog-card-root")).toHaveCount(0);
});
