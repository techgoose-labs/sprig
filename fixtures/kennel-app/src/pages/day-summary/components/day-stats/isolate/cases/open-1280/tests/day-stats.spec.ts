import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const U = 'sprig-island[data-sel="day-stats"]';

/** Post the stage bridge's live signal set — the headless stand-in for a control edit / channel publish. */
async function setSignal(page: import("@playwright/test").Page, key: string, value: unknown) {
  await page.evaluate(([k, v]) =>
    window.postMessage({ target: "isolate-stage", type: "set", scope: "signal", key: k, value: v }, "*"), [key, value] as const);
}

test("E1: an open day's revenue desc reads 'Settles when the day closes'", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-stats/open-1280`);
  await waitHydrated(page);
  await expect(page.locator(`${U} .day-stats-revenue-desc`)).toHaveText("Settles when the day closes");
});

test("E3: the figures are the server's, formatted not computed", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-stats/open-1280`);
  await waitHydrated(page);
  await expect(page.locator(`${U} .day-stats-occupancy .stat-value`)).toHaveText("19 of 40 kennels");
  await expect(page.locator(`${U} .day-stats-occupancy progress`)).toHaveAttribute("value", "48");
  await expect(page.locator(`${U} .day-stats-occupancy progress`)).toHaveAttribute("aria-label", "Occupancy");
  await expect(page.locator(`${U} .day-stats-occupancy .stat-desc`)).toContainText("48%");
  await expect(page.locator(`${U} .day-stats-revenue .stat-value`)).toHaveText("$1,225.00");
  await expect(page.locator(`${U} .day-stats-overdue .stat-value`)).toHaveText("2");
});

test("E4: the channel `day` reply reconciles in place, without replacing the region", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-stats/open-1280`);
  await waitHydrated(page);
  const url = page.url();
  const region = await page.locator(`${U} .stats`).elementHandle();
  await expect(page.locator(`${U} .day-stats-revenue-desc`)).toHaveText("Settles when the day closes");
  await setSignal(page, "day", {
    closed: true, kennelsUsed: 18, kennelsTotal: 40, occupancyPct: 45, revenueToday: 1310.5, overdueCount: 1,
  });
  await expect(page.locator(`${U} .day-stats-revenue-desc`)).toHaveText("Final");
  await expect(page.locator(`${U} .day-stats-occupancy .stat-value`)).toHaveText("18 of 40 kennels");
  await expect(page.locator(`${U} .day-stats-occupancy progress`)).toHaveAttribute("value", "45");
  await expect(page.locator(`${U} .day-stats-revenue .stat-value`)).toHaveText("$1,310.50");
  await expect(page.locator(`${U} .day-stats-overdue .stat-value`)).toHaveText("1");
  expect(await region!.evaluate((n) => n.isConnected)).toBe(true);
  expect(page.url()).toBe(url);
});

test("E4 (seed): flipping the closed signal swaps the desc in place", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-stats/open-1280`);
  await waitHydrated(page);
  const region = await page.locator(`${U} .stats`).elementHandle();
  await setSignal(page, "closed", true);
  await expect(page.locator(`${U} .day-stats-revenue-desc`)).toHaveText("Final");
  expect(await region!.evaluate((n) => n.isConnected)).toBe(true);
});
