// dog-card Events: hover transitions the card's box-shadow to shadow-sm (the mock's
// `transition-shadow hover:shadow-sm`, motion.json: box-shadow over 150ms).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("hover: the card's box-shadow settles on shadow-sm", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-card/hover`);
  const card = page.locator(".iso-stage-page a.dog-card-root");
  const style = await card.evaluate((el) => {
    const s = getComputedStyle(el);
    return { prop: s.transitionProperty, dur: s.transitionDuration, shadow: s.boxShadow };
  });
  expect(style.prop).toBe("box-shadow");
  expect(style.dur).toBe("0.15s");
  expect(style.shadow).not.toContain("rgba(0, 0, 0, 0.1) 0px 1px 3px 0px");
  await card.hover();
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 3000 })
    .toContain("rgba(0, 0, 0, 0.1) 0px 1px 3px 0px");
});
