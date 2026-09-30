import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("walking renders its badge variant, label and decorative icon", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/status-badge/walking`);
  const badge = page.locator(".iso-stage-page span.badge");
  await expect(badge).toHaveCount(1);
  await expect(page.locator(".iso-stage-page span.badge.badge-accent")).toHaveText("Walking");
  await expect(page.locator(".iso-stage-page span.badge svg")).toHaveAttribute("aria-hidden", "true");
  await expect(badge).not.toHaveClass(/badge-sm/);
});

test("walking badge emits no custom event on click", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/status-badge/walking`);
  const types = await page.evaluate(() => {
    const seen: string[] = [];
    const native = new Set(["click", "mousedown", "mouseup", "pointerdown", "pointerup", "mousemove", "pointermove", "mouseover", "pointerover", "mouseenter", "pointerenter"]);
    const orig = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (e: Event) {
      if (!native.has(e.type)) seen.push(e.type);
      return orig.call(this, e);
    };
    (window as unknown as { __seen: string[] }).__seen = seen;
    return seen;
  });
  expect(types).toEqual([]);
  await page.locator(".iso-stage-page span.badge").click();
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen).toEqual([]);
});
