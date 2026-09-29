import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

// The runner exposes the preview server as ISOLATE_BASE_URL.
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = `${BASE}/pages/day-summary/close-day-control`;

// E5 — the server refuses (500): nothing changed, the control is back to an
// enabled "Close the day" and no badge appears. (The error toast goes onto the
// page's toasts channel — not observable in isolate; see the build report.)
test("a refused close returns to an enabled Close the day", async ({ page }) => {
  await page.goto(`${ROUTE}/rolled-back`);
  await waitHydrated(page);
  const replied = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/day/close");
  await page.locator("#close-day").click();
  expect((await replied).status()).toBe(500);
  const btn = page.locator("button#close-day");
  await expect(btn).toBeEnabled();
  await expect(btn).toHaveText(/Close the day/);
  await expect(page.locator(".badge")).toHaveCount(0);
});
