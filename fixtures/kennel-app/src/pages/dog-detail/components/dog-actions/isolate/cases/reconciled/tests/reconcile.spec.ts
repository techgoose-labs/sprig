import { expect, test, type Page } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const btn = (page: Page, cmd: string) => page.locator(`[data-cmd="dog.${cmd}"]`);

test("REQ E1/E7: an accepted Check in (200) keeps the checked-in layout", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/reconciled`);
  await waitHydrated(page);
  const posted = page.waitForRequest((r) => /\/api\/dog\/check-in$/.test(new URL(r.url()).pathname));
  const answered = page.waitForResponse((r) => /\/api\/dog\/check-in$/.test(new URL(r.url()).pathname));
  await btn(page, "checkIn").click();
  await ev.expect((e) => e.type === "click" && /Check in/.test(e.detail ?? ""), { timeout: 3000 });
  expect((await posted).postDataJSON()).toMatchObject({ id: "d05", status: "checked-in" });
  expect((await answered).status()).toBe(200);
  // The durable end-state after the reply: still checked in (reconciled, not reverted).
  await expect(btn(page, "checkOut")).toHaveClass(/\bbtn-primary\b/);
  await expect(btn(page, "checkOut")).toBeEnabled();
  await expect(btn(page, "startWalk")).toBeEnabled();
  await expect(btn(page, "checkIn")).toBeDisabled();
});
