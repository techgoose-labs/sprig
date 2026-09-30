import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

// The runner exposes the preview server as ISOLATE_BASE_URL.
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = `${BASE}/pages/day-summary/close-day-control`;

// E6 — reply OK: the badge replaces the button and takes focus. (The day and
// the success toast go out on the day/toasts channels — not observable in
// isolate; see the build report.)
test("an accepted close replaces the button with the Day closed badge", async ({ page }) => {
  await page.goto(`${ROUTE}/accepted`);
  await waitHydrated(page);
  await page.locator("#close-day").click();
  const badge = page.locator(".badge", { hasText: "Day closed" });
  await expect(badge).toBeVisible();
  await expect(page.locator("#close-day")).toHaveCount(0);
  await expect(badge).toBeFocused();
});
