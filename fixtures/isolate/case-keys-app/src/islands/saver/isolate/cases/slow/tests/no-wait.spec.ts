import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("REQ-043: a delayed save does not hold the UI", async ({ page }) => {
  await page.goto(`${BASE}/components/saver/slow`);
  await waitHydrated(page);
  await page.locator("#save").click();
  // the server is held for 4s; the count must move well before that
  await expect(page.locator("#count")).toHaveText("1", { timeout: 500 });
  await expect(page.locator("#status")).toHaveText("pending");
});
