import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = "/components/shared-components/toast-stack";

// E1 — nothing summoned: the stack renders no entries.
test("E1: empty queue renders no alerts", async ({ page }) => {
  await page.goto(`${BASE}${ROUTE}/empty`);
  await waitHydrated(page);
  await expect(page.locator("toast-stack .alert, sprig-island[data-sel='toast-stack'] .alert")).toHaveCount(0);
});
