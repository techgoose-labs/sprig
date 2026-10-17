import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// The isolate runner re-asserts the case's `_theme` on <html> right after any app write
// (measured: data-theme "brand" -> "brand-dark" -> "brand" within one tick), so the toggle's
// write is observed as a MutationObserver record instead of the settled attribute.
const watchTheme = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __themes: string[] };
    w.__themes = [];
    new MutationObserver((ms) => {
      for (const m of ms) w.__themes.push(String(m.oldValue));
      w.__themes.push(String(document.documentElement.getAttribute("data-theme")));
    }).observe(document.documentElement, { attributes: true, attributeOldValue: true, attributeFilter: ["data-theme"] });
  });
const themesWritten = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __themes: string[] }).__themes);

test("clicking the toggle in dark flips the document back to brand", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/components/shared-components/theme-toggle/dark`);
  await waitHydrated(page);
  await watchTheme(page);
  await expect(page.locator("#theme-toggle")).toBeChecked();
  await page.locator("label[title='Toggle theme']").click();
  await ev.expect((e) => e.source === "input#theme-toggle" && e.type === "change");
  await expect.poll(() => themesWritten(page)).toContain("brand");
  await expect(page.locator("#theme-toggle")).not.toBeChecked();
  await expect.poll(() => page.locator("svg.lucide-sun").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});
