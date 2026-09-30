import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("nav labels at 640px: toBeVisible", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto(`${BASE}/components/shared-components/top-bar/bp-640`);
  await expect(page.getByText("Day summary")).toBeVisible();
});
