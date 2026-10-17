import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("a failed read renders load-error with Retry, not the not-found card", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/page/error`);
  await waitHydrated(page);
  const alert = page.locator(".dog-detail-error [role=alert]");
  await expect(alert).toHaveCount(1);
  await expect(alert.locator(".load-error-title")).toHaveText("Couldn't load today's board");
  await expect(alert.locator("a.load-error-retry")).toHaveText("Retry");
  await expect(page.getByText("We can't find that dog")).toHaveCount(0);
  await expect(page.locator(".dog-detail-back")).toHaveCount(0);
});
