import { expect, test, type Page } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const btn = (page: Page, cmd: string) => page.locator(`[data-cmd="dog.${cmd}"]`);

test("REQ E8: a closed day locks all four actions and says why", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/dog/")) posts.push(r.url()); });
  await page.goto(`${BASE}/pages/dog-detail/dog-actions/locked`);
  await waitHydrated(page);
  for (const cmd of ["checkIn", "startWalk", "endWalk", "checkOut"]) await expect(btn(page, cmd)).toBeDisabled();
  await expect(page.getByText("The day is closed — stays are locked.")).toBeVisible();
  // Check in keeps its primary style while locked (styling follows status, not closed).
  await expect(btn(page, "checkIn")).toHaveClass(/\bbtn-primary\b/);
  await btn(page, "checkIn").click({ force: true });
  await page.waitForTimeout(300);
  expect(posts).toEqual([]);
});
