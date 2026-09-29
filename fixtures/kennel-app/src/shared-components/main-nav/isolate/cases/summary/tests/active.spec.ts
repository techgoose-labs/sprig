import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("the active link follows the view signal and carries aria-current", async ({ page }) => {
  await page.goto(`${BASE}/components/shell/main-nav/summary`);
  await waitHydrated(page);
  const summary = page.locator('a[data-nav="summary"]');
  const board = page.locator('a[data-nav="board"]');
  await expect(summary).toHaveClass(/btn-active/);
  await expect(summary).toHaveAttribute("aria-current", "page");
  await expect(board).not.toHaveClass(/btn-active/);
  await expect(board).not.toHaveAttribute("aria-current", /.+/);
});
