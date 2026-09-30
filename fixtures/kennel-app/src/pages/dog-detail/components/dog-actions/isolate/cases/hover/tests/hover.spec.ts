import { expect, test, type Page } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const btn = (page: Page, cmd: string) => page.locator(`[data-cmd="dog.${cmd}"]`);

test("REQ E9: Check in transitions its colours over 200ms and not box-shadow", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/hover`);
  await waitHydrated(page);
  const b = btn(page, "checkIn");
  const style = await b.evaluate((el) => {
    const s = getComputedStyle(el);
    return { prop: s.transitionProperty, dur: s.transitionDuration, ease: s.transitionTimingFunction, bg: s.backgroundColor };
  });
  expect(style.prop).toContain("background-color");
  expect(style.prop).toContain("border-color");
  expect(style.prop).not.toContain("box-shadow");
  expect(style.dur.split(",").every((d) => d.trim() === "0.2s")).toBe(true);
  expect(style.ease).toContain("cubic-bezier(0, 0, 0.2, 1)");
  await b.hover();
  // Durable end-state: the hover colour settles away from the rest colour.
  await expect.poll(() => b.evaluate((el) => getComputedStyle(el).backgroundColor), { timeout: 3000 })
    .not.toBe(style.bg);
});
