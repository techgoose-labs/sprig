import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL_ = (c: string) => `${BASE}/pages/dog-detail/page/${c}`;
const hydrated = (page: import("@playwright/test").Page, sel: string) =>
  page.waitForSelector(`sprig-island[data-sel="${sel}"][data-sprig-hydrated]`, { state: "attached", timeout: 8000 });

// The build's board route is /ui (routes: "" under base /ui); the mock's #/board maps there.
test("back link goes to the board", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(URL_("default"));
  await waitHydrated(page); // the stage bridge reports events only once it is up
  const back = page.locator("a.dog-detail-back");
  await expect(back).toHaveAttribute("href", "/ui");
  await expect(back).toHaveText(/Board/);
  await page.route("**/ui", (r) => r.fulfill({ status: 200, body: "board" }));
  await back.click();
  await ev.expect((e) => e.source === "a" && e.type === "click" && /Board/.test(e.detail ?? ""), { timeout: 3000 });
});
