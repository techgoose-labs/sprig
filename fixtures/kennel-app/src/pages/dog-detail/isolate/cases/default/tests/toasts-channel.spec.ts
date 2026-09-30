import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL_ = (c: string) => `${BASE}/pages/dog-detail/page/${c}`;
const hydrated = (page: import("@playwright/test").Page, sel: string) =>
  page.waitForSelector(`sprig-island[data-sel="${sel}"][data-sprig-hydrated]`, { state: "attached", timeout: 8000 });

test("channel toasts: a rejected Check in toasts through the page's toast-stack and reverts the heading", async ({ page }) => {
  await page.route("**/api/dog/check-in", (r) => r.fulfill({ status: 500 }));
  await page.goto(URL_("default"));
  await waitHydrated(page);
  await hydrated(page, "dog-actions");
  await hydrated(page, "toast-stack");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.locator('sprig-island[data-sel="toast-stack"] .alert-error'))
    .toContainText("Biscuit: checked in didn't go through — reverted.", { timeout: 5000 });
  await expect(page.locator('sprig-island[data-sel="dog-heading"]')).toContainText("Booked", { timeout: 5000 });
});
