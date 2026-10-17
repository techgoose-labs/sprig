import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("each bar is scaled against kennelsTotal with its status variant", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/status-breakdown/default`);
  const bars = page.locator(".status-breakdown li progress");
  await expect(bars).toHaveCount(4);
  const values = ["7", "14", "5", "6"];
  for (const [i, v] of values.entries()) {
    await expect(bars.nth(i)).toHaveAttribute("value", v);
    await expect(bars.nth(i)).toHaveAttribute("max", "40");
  }
  await expect(bars.nth(0)).toHaveClass(/progress-info/);
  await expect(bars.nth(1)).toHaveClass(/progress-success/);
  await expect(bars.nth(2)).toHaveClass(/progress-accent/);
  await expect(bars.nth(3)).not.toHaveClass(/progress-(info|success|accent)/);
  await expect(bars.nth(1)).toHaveAttribute("aria-label", "Checked in: 14 of 40 kennels");
});
