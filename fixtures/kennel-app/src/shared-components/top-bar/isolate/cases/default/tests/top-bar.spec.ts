import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL = `${BASE}/components/shared-components/top-bar/default`;

test("wordmark is the home link", async ({ page }) => {
  await page.goto(URL);
  const mark = page.locator("a.top-bar-wordmark");
  await expect(mark).toHaveText("Kennel board");
  await expect(mark).toHaveAttribute("href", "/ui");
});

test("header is sticky, z-30, 64px tall", async ({ page }) => {
  await page.goto(URL);
  const dims = await page.locator("header.top-bar-bar").evaluate((el) => [
    getComputedStyle(el).position,
    getComputedStyle(el).zIndex,
    el.getBoundingClientRect().height,
  ]);
  expect(dims).toEqual(["sticky", "30", 64]);
});

test("view passes through to main-nav (Board current)", async ({ page }) => {
  await page.goto(URL);
  await waitHydrated(page);
  await expect(page.locator("header.top-bar-bar [aria-current='page']")).toContainText("Board");
});

test("composes the theme toggle", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("header.top-bar-bar #theme-toggle")).toHaveCount(1);
});
