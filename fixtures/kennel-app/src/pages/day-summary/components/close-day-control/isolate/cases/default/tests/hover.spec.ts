import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

// The runner exposes the preview server as ISOLATE_BASE_URL.
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = `${BASE}/pages/day-summary/close-day-control`;

// Motion — hover transitions colours over 200ms cubic-bezier(0,0,0.2,1);
// the rebuild drops box-shadow from the transition list (jank fix 1).
test("hover transitions colours, not box-shadow", async ({ page }) => {
  await page.goto(`${ROUTE}/default`);
  await waitHydrated(page);
  const btn = page.locator("button#close-day");
  const t = await btn.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { prop: cs.transitionProperty, dur: cs.transitionDuration, ease: cs.transitionTimingFunction };
  });
  expect(t.prop).toContain("background-color");
  expect(t.prop).not.toContain("box-shadow");
  expect(t.dur.split(",")[0].trim()).toBe("0.2s");
  expect(t.ease.startsWith("cubic-bezier(0, 0, 0.2, 1)")).toBe(true);
  const rest = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
  await btn.hover();
  // durable end-state: the hovered background settles on a different colour
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundColor), { timeout: 3000 })
    .not.toBe(rest);
});
