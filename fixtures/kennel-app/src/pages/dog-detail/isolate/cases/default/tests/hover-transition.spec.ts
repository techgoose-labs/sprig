import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL_ = (c: string) => `${BASE}/pages/dog-detail/page/${c}`;
const hydrated = (page: import("@playwright/test").Page, sel: string) =>
  page.waitForSelector(`sprig-island[data-sel="${sel}"][data-sprig-hydrated]`, { state: "attached", timeout: 8000 });

test("back link keeps the 200ms hover colour transition", async ({ page }) => {
  await page.goto(URL_("default"));
  const d = await page.locator("a.dog-detail-back").evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(d).toContain("0.2s");
});
