import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("hover booked: base-100 → base-200 over 150ms standard easing", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/status-strip/hover-booked`);
  const card = page.locator("#status-strip-booked");
  await expect(card).toHaveCSS("background-color", "rgb(251, 247, 240)");
  const t = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { d: cs.transitionDuration, f: cs.transitionTimingFunction };
  });
  expect(t.d).toContain("0.15s");
  expect(t.f).toContain("cubic-bezier(0.4, 0, 0.2, 1)");
  await card.hover();
  await expect(card).toHaveCSS("background-color", "rgb(243, 234, 219)", { timeout: 5000 });
});
