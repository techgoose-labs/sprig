import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("empty-filter: none walking, Show all dogs links to ?status=all", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-grid/empty-filter`);
  await expect(page.getByText("No dogs are walking right now.")).toBeVisible();
  await expect(page.locator("a.dog-card-root")).toHaveCount(0);
  const link = page.getByRole("link", { name: "Show all dogs" });
  await expect(link).toHaveAttribute("href", /status=all/);
  await link.click();
  await expect(page).toHaveURL(/[?&]status=all/);
});
