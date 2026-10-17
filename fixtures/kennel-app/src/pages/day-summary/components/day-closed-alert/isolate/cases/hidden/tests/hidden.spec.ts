import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
/** Post the stage bridge's live signal set — the headless stand-in for a control edit. */
async function setSignal(page: import("@playwright/test").Page, key: string, value: unknown) {
  await page.evaluate(([k, v]) =>
    window.postMessage({ target: "isolate-stage", type: "set", scope: "signal", key: k, value: v }, "*"), [key, value] as const);
}

const ALERT = 'sprig-island[data-sel="day-closed-alert"] [role="alert"]';

test("E1: an open day renders nothing", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-closed-alert/hidden`);
  await waitHydrated(page);
  await expect(page.locator(ALERT)).toHaveCount(0);
  // no placeholder, no reserved space
  const host = page.locator('sprig-island[data-sel="day-closed-alert"]');
  expect(await host.evaluate((el) => getComputedStyle(el).marginBottom)).toBe("0px");
  expect(await host.evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
});

test("E2: the alert appears in place, without a reload, when closed flips true", async ({ page }) => {
  const ev = await capture(page); // before goto
  // capture() exposes { events$, expect }; collect everything the stage sees.
  const seen: { source: string }[] = [];
  ev.events$.subscribe((e: { source: string }) => seen.push(e));
  await page.goto(`${BASE}/pages/day-summary/day-closed-alert/hidden`);
  await waitHydrated(page);
  const url = page.url();
  await expect(page.locator(ALERT)).toHaveCount(0);
  // What the workbench's `closed` checkbox sends (a live signal set, not a remount).
  await setSignal(page, "closed", true);
  await expect(page.locator(`${ALERT}.alert-success`))
    .toHaveText("Today's ledger is locked. Revenue below is final.");
  expect(page.url()).toBe(url);
  // the unit itself fires nothing:
  expect(seen.filter((e) => e.source.startsWith("day-closed-alert"))).toHaveLength(0);
});

test("E2 (channel): a confirmed close on the `day` channel shows the alert in place", async ({ page }) => {
  await page.goto(`${BASE}/pages/day-summary/day-closed-alert/hidden`);
  await waitHydrated(page);
  const url = page.url();
  await expect(page.locator(ALERT)).toHaveCount(0);
  await setSignal(page, "day", { closed: true });
  await expect(page.locator(`${ALERT}.alert-success`))
    .toHaveText("Today's ledger is locked. Revenue below is final.");
  expect(page.url()).toBe(url);
});
