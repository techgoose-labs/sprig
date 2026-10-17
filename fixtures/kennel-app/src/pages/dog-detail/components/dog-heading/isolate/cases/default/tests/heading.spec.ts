import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const R = `${BASE}/pages/dog-detail/dog-heading`;

test("default: h1 is the name, one Booked badge", async ({ page }) => {
  await page.goto(`${R}/default`);
  await waitHydrated(page);
  await expect(page.locator("h1")).toHaveText("Biscuit");
  await expect(page.locator(".badge")).toHaveText(["Booked"]);
});
