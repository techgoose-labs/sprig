import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// E8 — the focused note input shows a focus ring.
test("focused note input has an outline", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/focus`);
  await waitHydrated(page);
  const note = page.locator('sprig-island[data-sel="dog-notes"] input[name="text"]');
  await note.focus();
  expect(await note.evaluate((el) => document.activeElement === el)).toBe(true);
  const style = await note.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(style).not.toBe("none");
});
