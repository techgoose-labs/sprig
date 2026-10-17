import { expect, test, type Page } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const btn = (page: Page, cmd: string) => page.locator(`[data-cmd="dog.${cmd}"]`);

async function expectIntent(page: Page) {
  // E2 — the checked-in layout shows while the POST is still held (delay:3000).
  await expect(btn(page, "checkIn")).toBeDisabled({ timeout: 1000 });
  await expect(btn(page, "startWalk")).toBeEnabled({ timeout: 1000 });
  await expect(btn(page, "checkOut")).toBeEnabled({ timeout: 1000 });
  await expect(btn(page, "checkOut")).toHaveClass(/\bbtn-primary\b/);
  await expect(btn(page, "endWalk")).toBeDisabled();
}

test("REQ E2: pending-dark shows the checked-in intent before the held reply", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/pending-dark`);
  await waitHydrated(page);
  await btn(page, "checkIn").click();
  await expectIntent(page);
});
