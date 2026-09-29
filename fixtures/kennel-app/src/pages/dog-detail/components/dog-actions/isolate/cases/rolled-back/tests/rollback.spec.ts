import { expect, test, type Page } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const btn = (page: Page, cmd: string) => page.locator(`[data-cmd="dog.${cmd}"]`);

async function expectBooked(page: Page) {
  await expect(btn(page, "checkIn")).toBeEnabled({ timeout: 5000 });
  await expect(btn(page, "checkIn")).toHaveClass(/\bbtn-primary\b/);
  for (const cmd of ["startWalk", "endWalk", "checkOut"]) await expect(btn(page, cmd)).toBeDisabled();
}

test("REQ E1/E5: a rejected Check in (500) reverts to the booked layout", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/rolled-back`);
  await waitHydrated(page);
  const answered = page.waitForResponse((r) => /\/api\/dog\/check-in$/.test(new URL(r.url()).pathname));
  await btn(page, "checkIn").click();
  await ev.expect((e) => e.type === "click" && /Check in/.test(e.detail ?? ""), { timeout: 3000 });
  const res = await answered;
  expect(res.status()).toBe(500);
  await expectBooked(page);
});
