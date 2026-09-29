import { expect, test, type Page } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const btn = (page: Page, cmd: string) => page.locator(`[data-cmd="dog.${cmd}"]`);

async function expectBooked(page: Page) {
  await expect(btn(page, "checkIn")).toBeEnabled({ timeout: 5000 });
  await expect(btn(page, "checkIn")).toHaveClass(/\bbtn-primary\b/);
  for (const cmd of ["startWalk", "endWalk", "checkOut"]) await expect(btn(page, cmd)).toBeDisabled();
}

test("REQ E5: rolled back @640 returns to the booked layout", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/rolled-back-640`);
  await waitHydrated(page);
  const answered = page.waitForResponse((r) => /\/api\/dog\/check-in$/.test(new URL(r.url()).pathname));
  await btn(page, "checkIn").click();
  await answered;
  await expectBooked(page);
});
