import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = "/components/shared-components/toast-stack";

// E4 — kind picks the look; append order is top-to-bottom order.
test("E4: error then success, in append order, each with its kind's class", async ({ page }) => {
  await page.goto(`${BASE}${ROUTE}/stacked-1280-brand-dark`);
  await waitHydrated(page);
  const alerts = page.locator("sprig-island[data-sel='toast-stack'] .alert");
  await expect(alerts).toHaveCount(2);
  await expect(alerts.nth(0)).toHaveClass(/\balert-error\b/);
  await expect(alerts.nth(0)).toHaveText("The day couldn't be closed — nothing changed.");
  await expect(alerts.nth(0)).toHaveAttribute("role", "alert");
  await expect(alerts.nth(1)).toHaveClass(/\balert-success\b/);
  await expect(alerts.nth(1)).toHaveText("Day closed — ledger locked.");
  await expect(alerts.nth(1)).toHaveAttribute("role", "status");
});
