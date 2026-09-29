import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL_ = (c: string) => `${BASE}/pages/dog-detail/page/${c}`;
const hydrated = (page: import("@playwright/test").Page, sel: string) =>
  page.waitForSelector(`sprig-island[data-sel="${sel}"][data-sprig-hydrated]`, { state: "attached", timeout: 8000 });

test("unknown dog renders the not-found card with a way back", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(URL_("not-found"));
  await waitHydrated(page); // the stage bridge reports events only once it is up
  await expect(page.locator("h1")).toHaveText("We can't find that dog");
  await expect(page.getByText("It may have been removed from today's board.")).toBeVisible();
  const link = page.locator('a[href="/ui"]', { hasText: "Back to the board" });
  await expect(link).toHaveCount(1);
  await page.route("**/ui", (r) => r.fulfill({ status: 200, body: "board" }));
  await link.click();
  await ev.expect((e) => e.source === "a" && e.type === "click" && /Back to the board/.test(e.detail ?? ""), { timeout: 3000 });
});
