// day-summary · closing — E1 + E2: clicking Close the day holds the confirmed write pending.
import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E1+E2: Close the day goes pending while the reply is held", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/day-summary/closing`);
  await waitHydrated(page);
  const btn = page.locator("#close-day");
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(btn).toBeDisabled();
  await expect(btn).toContainText("Closing the day…");
  await expect(page.locator("#close-day .loading-spinner")).toBeVisible();
  await expect(btn).toHaveAttribute("aria-busy", "true");
});
