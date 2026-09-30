import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E3: a closed day shows the success alert with its decorative icon", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-closed-alert/default`);
  await waitHydrated(page);
  const alert = page.locator('sprig-island[data-sel="day-closed-alert"] [role="alert"].alert-success');
  await expect(alert).toHaveCount(1);
  await expect(alert).toHaveText("Today's ledger is locked. Revenue below is final.");
  await expect(alert.locator('svg[data-lucide="circle-check"][aria-hidden="true"]')).toHaveCount(1);
  // the mock's mb-5 gap to the stats, carried by the island host (outside the measured box)
  const host = page.locator('sprig-island[data-sel="day-closed-alert"]');
  expect(await host.evaluate((el) => getComputedStyle(el).marginBottom)).toBe("20px");
});
