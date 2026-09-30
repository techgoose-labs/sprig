import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("hovering the inactive link paints the ghost-hover fill; Board stays active", async ({ page }) => {
  await page.goto(`${BASE}/components/shell/main-nav/hover-summary`);
  await waitHydrated(page);
  const summary = page.locator('a[data-nav="summary"]');
  await expect(summary).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await summary.hover();
  await expect
    .poll(() => summary.evaluate((a) => getComputedStyle(a).backgroundColor), { timeout: 2000 })
    .not.toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator('a[data-nav="board"]')).toHaveClass(/btn-active/);
  await expect(summary).not.toHaveClass(/btn-active/);
});
