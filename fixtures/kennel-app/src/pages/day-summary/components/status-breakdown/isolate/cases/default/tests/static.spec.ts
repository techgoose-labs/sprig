import { expect, test } from "@playwright/test";
import { capture } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("static unit: nothing interactive, nothing fires", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/pages/day-summary/status-breakdown/default`);
  await expect(page.locator(".status-breakdown")).toHaveCount(1);
  await expect(page.locator(".status-breakdown :is(button,a,input,[tabindex])")).toHaveCount(0);
  await page.locator(".status-breakdown").click();
  await expect(
    ev.expect((e) => e.source.startsWith("button") || e.source.startsWith("a"), { timeout: 500 }),
  ).rejects.toThrow();
});
