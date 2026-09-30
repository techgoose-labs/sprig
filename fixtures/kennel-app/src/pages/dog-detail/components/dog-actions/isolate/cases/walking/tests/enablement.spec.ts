import { expect, test, type Page } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const btn = (page: Page, cmd: string) => page.locator(`[data-cmd="dog.${cmd}"]`);

// E10 — the enabled set (and primary styling) follows the status (dog-actions.md §1).
test("REQ E10: walking enables the status-ruled set", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/walking`);
  await waitHydrated(page);
  const enabled = new Set(["endWalk"]);
  const primary = new Set<string>([]);
  for (const cmd of ["checkIn", "startWalk", "endWalk", "checkOut"]) {
    const b = btn(page, cmd);
    if (enabled.has(cmd)) await expect(b).toBeEnabled();
    else await expect(b).toBeDisabled();
    if (primary.has(cmd)) await expect(b).toHaveClass(/\bbtn-primary\b/);
    else await expect(b).toHaveClass(/\bbtn-soft\b.*\bbtn-secondary\b|\bbtn-secondary\b.*\bbtn-soft\b/);
  }
});
