// At 375 the overdue badge wraps below the dog name.
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("overdue badge sits below the name", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${BASE}/pages/day-summary/overdue-pickups/w375`);
  const row = page.locator("section.overdue-pickups-card li").first();
  const name = await row.locator("a").boundingBox();
  const flag = await row.locator(".overdue-pickups-flag").boundingBox();
  expect(name).not.toBeNull();
  expect(flag).not.toBeNull();
  expect(flag!.y).toBeGreaterThanOrEqual(name!.y + name!.height - 1);
});
