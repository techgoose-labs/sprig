import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// E7 — required-only validation: an empty note fires no request and appends no row.
test("empty note: Add note sends nothing and appends nothing", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/add-note$/.test(new URL(r.url()).pathname)) posts.push(r.url());
  });
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/default`);
  await waitHydrated(page);
  const island = page.locator('sprig-island[data-sel="dog-notes"]');
  await expect(island.locator("li.dog-notes-item")).toHaveCount(3);
  await expect(island.locator('input[name="text"]')).toHaveValue("");
  await island.getByRole("button", { name: "Add note" }).click();
  await page.waitForTimeout(400);
  await expect(island.locator("li.dog-notes-item")).toHaveCount(3);
  await expect(island.locator(".badge")).toHaveText("3");
  expect(posts).toEqual([]);
});
