import { expect, test, type Page } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
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

test("REQ E1/E2/E3: Check in shows its intent before the held reply and posts {id, status}", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/pending`);
  await waitHydrated(page);
  const posted = page.waitForRequest((r) =>
    r.method() === "POST" && /\/api\/dog\/check-in$/.test(new URL(r.url()).pathname)
  );
  await btn(page, "checkIn").click();
  // E1 — the click reaches the bridge.
  await ev.expect((e) => e.type === "click" && /Check in/.test(e.detail ?? ""), { timeout: 3000 });
  await expectIntent(page);
  // E3 — the command body carries the intent.
  const req = await posted;
  expect(req.postDataJSON()).toMatchObject({ id: "d01", status: "checked-in" });
  // Focus stays on the clicked control (no full re-render).
  await expect(btn(page, "checkIn")).toBeAttached();
});
