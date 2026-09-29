// day-summary · default — E1 + E3: a confirmed close flips the header, alert, stats and toasts.
import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

const closedDay = {
  id: "today", date: "2026-09-29", closed: true, kennelsTotal: 40, kennelsUsed: 19,
  occupancyPct: 48, revenueToday: 1225,
  byStatus: { booked: 7, "checked-in": 14, walking: 5, "checked-out": 6 }, overdueCount: 2,
};

test("E3: a 200 reply closes the day in place, without a reload", async ({ page }) => {
  // No backend: fake the confirmed reply here so the case itself stays pristine for _reference.
  await page.route("**/api/day/close", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(closedDay) }));
  await page.goto(`${BASE}/pages/kennel/day-summary/default`);
  await waitHydrated(page);
  await page.locator("#close-day").click();
  await expect(page.getByText("Day closed", { exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("alert").filter({ hasText: "Today's ledger is locked. Revenue below is final." })).toBeVisible();
  await expect(page.getByText("Final", { exact: true })).toBeVisible();
  await expect(page.locator("#close-day")).toHaveCount(0);
  await expect(page.getByText("Day closed — ledger locked.")).toBeVisible();
});
