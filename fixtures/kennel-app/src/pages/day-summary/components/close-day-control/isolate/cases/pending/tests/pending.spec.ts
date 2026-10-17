import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

// The runner exposes the preview server as ISOLATE_BASE_URL.
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = `${BASE}/pages/day-summary/close-day-control`;

// E4 — a disabled pending button is inert: a forced click fires no request
// (the runner's network row for this case must also read "fired 0×").
test("a pending button is inert", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") posts.push(r.url()); });
  await page.goto(`${ROUTE}/pending`);
  await waitHydrated(page);
  const btn = page.locator("button#close-day");
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveText(/Closing the day…/);
  await btn.click({ force: true });
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
  await expect(btn).toBeDisabled();
});
