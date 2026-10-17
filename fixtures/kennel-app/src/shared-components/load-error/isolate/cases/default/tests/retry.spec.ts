import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("Retry is a link that reloads the current route", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/components/shared-components/load-error/default`);
  await waitHydrated(page);
  const retry = page.locator("a.load-error-retry");
  expect(await retry.evaluate((a) => (a as HTMLAnchorElement).href)).toBe(page.url());
  await page.getByRole("link", { name: "Retry" }).click();
  await ev.expect((e) => e.source === "a" && e.type === "click");
});
