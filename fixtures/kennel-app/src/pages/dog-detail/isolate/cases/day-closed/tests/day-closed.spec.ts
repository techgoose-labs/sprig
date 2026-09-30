import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL_ = (c: string) => `${BASE}/pages/dog-detail/page/${c}`;
const hydrated = (page: import("@playwright/test").Page, sel: string) =>
  page.waitForSelector(`sprig-island[data-sel="${sel}"][data-sprig-hydrated]`, { state: "attached", timeout: 8000 });

test("day closed: every action is disabled and the lock note shows", async ({ page }) => {
  await page.goto(URL_("day-closed"));
  await waitHydrated(page);
  await hydrated(page, "dog-actions");
  for (const name of ["Check in", "Start walk", "End walk", "Check out"]) {
    await expect(page.getByRole("button", { name })).toBeDisabled();
  }
  await expect(page.getByText("The day is closed — stays are locked.")).toBeVisible();
});
