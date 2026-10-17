import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const R = `${BASE}/pages/dog-detail/dog-heading`;

test("long-name-walking-375: the name wraps inside the viewport", async ({ page }) => {
  await page.goto(`${R}/long-name-walking-375`);
  await waitHydrated(page);
  await expect(page.locator("h1")).toHaveText("Sir Reginald Barksworth-Fluffington III");
  const h = await page.locator("h1").boundingBox();
  expect(h?.width ?? Infinity).toBeLessThanOrEqual(351);
});
