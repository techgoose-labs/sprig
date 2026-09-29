import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// Motion — Add note hover: 200ms colour transitions, cubic-bezier(0,0,0.2,1), no box-shadow.
test("Add note hover transitions colours only", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/default`);
  await waitHydrated(page);
  const btn = page.locator('sprig-island[data-sel="dog-notes"]').getByRole("button", { name: "Add note" });
  await btn.hover();
  const anims = await btn.evaluate((el) =>
    el.getAnimations().map((a) => {
      const t = (a.effect as KeyframeEffect).getTiming();
      return {
        prop: (a as CSSTransition).transitionProperty,
        duration: t.duration,
        easing: t.easing,
      };
    })
  );
  const props = anims.map((a) => a.prop);
  expect(props).toContain("background-color");
  expect(props).toContain("color");
  expect(props).not.toContain("box-shadow");
  for (const a of anims) {
    expect(a.duration).toBe(200);
    expect(a.easing.replace(/\s/g, "")).toBe("cubic-bezier(0,0,0.2,1)");
  }
});
