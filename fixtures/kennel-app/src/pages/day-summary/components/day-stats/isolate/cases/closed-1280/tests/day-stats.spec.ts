import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const U = 'sprig-island[data-sel="day-stats"]';

test("E2: a closed day's revenue desc reads 'Final'", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-stats/closed-1280`);
  await waitHydrated(page);
  await expect(page.locator(`${U} .day-stats-revenue-desc`)).toHaveText("Final");
  await expect(page.locator(`${U} .day-stats-revenue .stat-value`)).toHaveText("$1,225.00");
});
