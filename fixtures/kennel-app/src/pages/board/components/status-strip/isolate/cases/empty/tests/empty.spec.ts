import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("empty: all four counts read an em dash", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/status-strip/empty`);
  for (const s of ["booked", "checked-in", "walking", "checked-out"]) {
    await expect(page.locator(`#status-strip-${s} .status-strip-count`)).toHaveText("—");
  }
});
