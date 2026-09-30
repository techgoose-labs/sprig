// day-summary · default — E5: each overdue dog is a real link to its dog-detail route.
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E5: Rocco links to /ui/dog/d14, Olive to /ui/dog/d18", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/day-summary/default`);
  await expect(page.getByRole("link", { name: "Rocco" })).toHaveAttribute("href", "/ui/dog/d14");
  await expect(page.getByRole("link", { name: "Olive" })).toHaveAttribute("href", "/ui/dog/d18");
});
