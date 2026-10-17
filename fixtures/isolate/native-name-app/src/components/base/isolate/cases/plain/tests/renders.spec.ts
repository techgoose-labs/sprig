import { expect, test } from "@playwright/test";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("REQ-061: a component named base renders", async ({ page }) => {
  await page.goto(`${BASE}/components/base/plain`);
  await expect(page.locator(".base-box")).toHaveText("base");
});
