import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("E4: every tab links to its own ?status=", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/status-filter-tabs/default`);
  await expect(page.locator("#sft-all")).toHaveAttribute("href", "?status=all");
  for (const s of ["booked", "checked-in", "walking", "checked-out"]) {
    await expect(page.locator("#sft-" + s)).toHaveAttribute("href", "?status=" + s);
  }
});
