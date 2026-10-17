import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("below sm the links are icon-only but keep an accessible name", async ({ page }) => {
  await page.goto(`${BASE}/components/shell/main-nav/board-375`);
  await waitHydrated(page);
  await expect(page.locator('a[data-nav="board"] span')).toBeHidden();
  await expect(page.locator('a[data-nav="summary"] span')).toBeHidden();
  await expect(page.getByRole("link", { name: "Board" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Day summary" })).toBeVisible();
});
