import { expect, test } from "@playwright/test";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("REQ-040: renders at the case's _viewport width", async ({ page }) => {
  await page.goto(`${BASE}/components/swatch/match`);
  expect(await page.evaluate(() => innerWidth)).toBe(375);
});
