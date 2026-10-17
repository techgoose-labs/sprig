import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = "/components/shared-components/toast-stack";

// E2 — anchored bottom-right: 16px right inset, 16 + 48px bottom inset (1280x800).
test("E2: entry anchors 16px from the right and 64px from the bottom", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}${ROUTE}/page-context`);
  await waitHydrated(page);
  const alert = page.locator("sprig-island[data-sel='toast-stack'] .alert");
  await expect(alert).toHaveCount(1);
  // Poll the settled box: the 250 ms entrance scales the entry from 0.9.
  const edge = async () => {
    const b = await alert.boundingBox();
    return b ? [Math.round(b.x + b.width), Math.round(b.y + b.height)] : null;
  };
  await expect.poll(edge, { timeout: 3000 }).toEqual([1264, 736]);
});
