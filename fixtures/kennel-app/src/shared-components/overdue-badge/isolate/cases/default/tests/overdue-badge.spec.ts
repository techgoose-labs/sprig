// E1 + E2 + E3 for the default case
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL = `${BASE}/components/shared-components/overdue-badge/default`;

test("E1 renders duration", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("span.badge.badge-error")).toHaveText("Overdue · 2h 15m");
});

test("E2 icon present, decorative", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("span.badge svg.lucide-alarm-clock[aria-hidden='true']")).toHaveCount(1);
});

test("E3 no wrap", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("span.badge")).toHaveCSS("white-space", "nowrap");
});
