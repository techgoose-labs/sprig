import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("the dog detail view highlights Board", async ({ page }) => {
  await page.goto(`${BASE}/components/shell/main-nav/dog`);
  await waitHydrated(page);
  await expect(page.locator('a[data-nav="board"]')).toHaveClass(/btn-active/);
  await expect(page.locator('a[data-nav="board"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('a[data-nav="summary"]')).not.toHaveClass(/btn-active/);
});
