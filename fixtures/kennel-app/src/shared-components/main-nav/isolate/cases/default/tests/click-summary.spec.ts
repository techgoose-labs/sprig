import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("clicking Day summary fires the click and moves the active link", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/components/shell/main-nav/default`);
  await waitHydrated(page);
  const summary = page.locator('a[data-nav="summary"]');
  // The link's route is the app's; in isolate, keep the preview page (the route effect is asserted at composition).
  await expect(summary).toHaveAttribute("href", "/ui/summary");
  await page.evaluate(() => addEventListener("click", (e) => e.preventDefault()));
  await summary.click();
  await ev.expect((e) => e.type === "click" && /Day summary/.test(e.detail ?? ""));
  await expect(summary).toHaveClass(/btn-active/);
  await expect(summary).toHaveAttribute("aria-current", "page");
  await expect(page.locator('a[data-nav="board"]')).not.toHaveClass(/btn-active/);
});

test("labels show at 1280", async ({ page }) => {
  await page.goto(`${BASE}/components/shell/main-nav/default`);
  await waitHydrated(page);
  await expect(page.locator('a[data-nav="board"] span')).toBeVisible();
  await expect(page.locator('a[data-nav="board"] span')).toHaveText("Board");
});
