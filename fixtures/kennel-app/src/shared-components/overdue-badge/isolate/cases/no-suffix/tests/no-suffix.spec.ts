import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E5 no suffix renders bare Overdue", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/overdue-badge/no-suffix`);
  await expect(page.locator("span.badge")).toHaveText("Overdue");
});
