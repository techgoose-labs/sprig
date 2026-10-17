import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// main-nav lives in the shell (no route data): at hydration it derives `view` from location.pathname.
// To put the island at an app path, serve this case's preview HTML AT that path, without its case seeding.
async function openAt(page: import("@playwright/test").Page, appPath: string) {
  const raw = await (await page.request.get(`${BASE}/components/shell/main-nav/default`)).text();
  // Drop the stage-bridge's case seeding (it sets view="board" after hydration) — in the shell nothing seeds.
  const html = raw.replace(/"signals":\{"view":"board"\}/, '"signals":{}');
  if (html === raw) throw new Error("preview HTML no longer carries the case signals this test strips");
  await page.route(`${BASE}${appPath}`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(`${BASE}${appPath}`);
  await page.waitForSelector('sprig-island[data-sel="main-nav"][data-sprig-hydrated]', { state: "attached", timeout: 8000 });
}

const cases: Array<[string, "board" | "summary"]> = [
  ["/ui/summary", "summary"],
  ["/ui/dog/d01", "board"],
  ["/ui", "board"],
];
for (const [path, active] of cases) {
  test(`at ${path} the ${active} link is active`, async ({ page }) => {
    await openAt(page, path);
    const other = active === "board" ? "summary" : "board";
    await expect(page.locator(`a[data-nav="${active}"]`)).toHaveClass(/btn-active/);
    await expect(page.locator(`a[data-nav="${active}"]`)).toHaveAttribute("aria-current", "page");
    await expect(page.locator(`a[data-nav="${other}"]`)).not.toHaveClass(/btn-active/);
  });
}

test("a non-app path leaves the seeded view alone", async ({ page }) => {
  await page.goto(`${BASE}/components/shell/main-nav/summary`);
  await waitHydrated(page);
  await expect(page.locator('a[data-nav="summary"]')).toHaveClass(/btn-active/);
  await expect(page.locator('a[data-nav="board"]')).not.toHaveClass(/btn-active/);
});
