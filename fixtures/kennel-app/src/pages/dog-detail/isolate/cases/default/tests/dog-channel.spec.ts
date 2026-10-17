import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL_ = (c: string) => `${BASE}/pages/dog-detail/page/${c}`;
const hydrated = (page: import("@playwright/test").Page, sel: string) =>
  page.waitForSelector(`sprig-island[data-sel="${sel}"][data-sprig-hydrated]`, { state: "attached", timeout: 8000 });

test("channel dog: the heading follows dog-actions' optimistic status", async ({ page }) => {
  const ev = await capture(page);
  await page.route("**/api/dog/check-in", (r) => r.fulfill({ status: 200, json: { id: "d01", status: "checked-in" } }));
  await page.goto(URL_("default"));
  await waitHydrated(page);
  await hydrated(page, "dog-actions");
  await hydrated(page, "dog-heading");
  await page.getByRole("button", { name: "Check in" }).click();
  await ev.expect((e) => /^button\b/.test(e.source) && e.type === "click", { timeout: 3000 });
  await expect(page.locator('sprig-island[data-sel="dog-heading"]')).toContainText("Checked in", { timeout: 5000 });
});
