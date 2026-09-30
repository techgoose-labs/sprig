import { expect, test } from "@playwright/test";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("REQ-061: the project's playwright.config `use` reaches the case", async ({ page }) => {
  await page.goto(`${BASE}/components/tile/plain`);
  expect(await page.evaluate(() => innerWidth)).toBe(411);
  expect(
    await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches),
  ).toBe(true);
});
