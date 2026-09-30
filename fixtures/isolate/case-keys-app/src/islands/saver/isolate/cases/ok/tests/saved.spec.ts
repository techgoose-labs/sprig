import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("REQ-043: a faked 200 keeps the optimistic count", async ({ page }) => {
  await page.goto(`${BASE}/components/saver/ok`);
  await waitHydrated(page);
  await page.locator("#save").click();
  await expect(page.locator("#status")).toHaveText("saved");
  await expect(page.locator("#count")).toHaveText("1");
});
