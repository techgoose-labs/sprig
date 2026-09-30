import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// The icon swap's transition spec (spec §6): opacity + rotate, 200 ms, cubic-bezier(0, 0, 0.2, 1).
// Asserted on the computed transition declaration (the durable end-state), not on a live animation window.
test("sun and moon icons swap with a 200ms opacity + rotate transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${BASE}/components/shared-components/theme-toggle/default`);
  await waitHydrated(page);
  const timing = (sel: string) =>
    page.locator(sel).evaluate((el) => {
      const s = getComputedStyle(el);
      return { property: s.transitionProperty, duration: s.transitionDuration, easing: s.transitionTimingFunction };
    });
  for (const sel of ["svg.lucide-sun", "svg.lucide-moon"]) {
    const t = await timing(sel);
    expect(t.property).toContain("opacity");
    expect(t.property).toContain("rotate");
    expect(t.duration.split(",")[0].trim()).toBe("0.2s");
    expect(t.easing.split(/,(?![^(]*\))/)[0].trim()).toBe("cubic-bezier(0, 0, 0.2, 1)");
  }
  await page.locator("label[title='Toggle theme']").click();
  await expect.poll(() => page.locator("svg.lucide-moon").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await expect.poll(() => page.locator("svg.lucide-sun").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
});
