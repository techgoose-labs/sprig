import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("default: one card per row, 32 cards linking to dog detail", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-grid/default`);
  const cards = page.locator(".dog-grid-list a.dog-card-root");
  await expect(cards).toHaveCount(32);
  await expect(page.locator(".dog-grid-list a[href='/ui/dog/d01']")).toHaveCount(1);
  await page.locator(".dog-grid-list a[href='/ui/dog/d01']").click();
  await expect(page).toHaveURL(/\/ui\/dog\/d01$/);
});

test("default: cards in a row stretch to the row height", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-grid/default`);
  // static <dog-card> renders hostless: its <a> is the grid item itself
  const items = page.locator(".dog-grid-list > a.dog-card-root");
  await expect(items).toHaveCount(32);
  const heights = await items.evaluateAll((els) =>
    els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().height))
  );
  expect(new Set(heights).size).toBe(1);
});
