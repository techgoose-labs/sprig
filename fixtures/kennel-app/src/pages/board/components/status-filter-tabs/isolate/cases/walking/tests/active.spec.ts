import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E5: the active tab is marked tab-active + aria-selected, the others are not", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/status-filter-tabs/walking`);
  const active = page.locator("#sft-walking");
  await expect(active).toHaveClass(/\btab-active\b/);
  await expect(active).toHaveAttribute("aria-selected", "true");
  for (const s of ["all", "booked", "checked-in", "checked-out"]) {
    await expect(page.locator("#sft-" + s)).not.toHaveClass(/\btab-active\b/);
    await expect(page.locator("#sft-" + s)).not.toHaveAttribute("aria-selected", "true");
  }
});
