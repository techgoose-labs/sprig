import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
// A static unit renders in isolate without its <status-breakdown> host tag — locators target the unit root.

test("rows render in ORDER with the real labels and counts", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/status-breakdown/default`);
  const rows = page.locator(".status-breakdown li");
  await expect(rows).toHaveCount(4);
  const expected: [string, string][] = [["Booked", "7"], ["Checked in", "14"], ["Walking", "5"], ["Checked out", "6"]];
  for (const [i, [label, count]] of expected.entries()) {
    await expect(rows.nth(i)).toContainText(label);
    await expect(rows.nth(i).locator(".status-breakdown-count")).toHaveText(count);
  }
  await expect(page.locator(".status-breakdown h2")).toHaveText("Dogs by status");
});
