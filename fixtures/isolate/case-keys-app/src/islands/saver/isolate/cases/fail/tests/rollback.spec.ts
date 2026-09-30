import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("REQ-043: a failed save rolls the optimistic count back", async ({ page }) => {
  await page.goto(`${BASE}/components/saver/fail`);
  await waitHydrated(page);
  await page.locator("#save").click();
  await expect(page.locator("#status")).toHaveText("rolled back");
  await expect(page.locator("#count")).toHaveText("0");
});
