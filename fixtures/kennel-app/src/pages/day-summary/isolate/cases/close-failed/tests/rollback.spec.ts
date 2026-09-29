// day-summary · close-failed — E1 + E4: a refused close changes nothing and toasts the error.
import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E4: a 400 reply keeps the day open and shows the error toast", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/day-summary/close-failed`);
  await waitHydrated(page);
  await page.locator("#close-day").click();
  await expect(page.getByText("The day couldn't be closed — nothing changed.")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#close-day")).toBeEnabled();
  await expect(page.locator("#close-day")).toHaveText(/Close the day/);
  await expect(page.getByText("Settles when the day closes")).toBeVisible();
  await expect(page.getByText("Today's ledger is locked. Revenue below is final.")).toHaveCount(0);
});
