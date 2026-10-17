import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = "/components/shared-components/toast-stack";

// E3 — an entry lives `lifetime` (3500 ms) from entering the queue, then leaves.
test("E3: entry stays past 2.5s and is gone within 4.5s", async ({ page }) => {
  await page.goto(`${BASE}${ROUTE}/auto-dismiss`);
  await waitHydrated(page);
  const alerts = page.locator("sprig-island[data-sel='toast-stack'] .alert");
  await expect(alerts).toHaveCount(1);
  await page.waitForTimeout(2500);
  await expect(alerts).toHaveCount(1); // not removed early
  await expect(alerts).toHaveCount(0, { timeout: 4500 });
});
