import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("the alert announces the load failure", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/load-error/default`);
  await expect(page.getByRole("alert")).toContainText("Couldn't load today's board");
});
