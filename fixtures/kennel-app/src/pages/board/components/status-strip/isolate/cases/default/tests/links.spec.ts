import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ORDER = ["booked", "checked-in", "walking", "checked-out"];

test("default: counts in order, filter hrefs, no aria-current", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/status-strip/default`);
  const cards = page.locator(".iso-stage-page a.status-strip-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator(".status-strip-count")).toHaveText(["7", "14", "5", "6"]);
  for (const [i, s] of ORDER.entries()) {
    const card = cards.nth(i);
    await expect(card).toHaveAttribute("id", `status-strip-${s}`);
    await expect(card).toHaveAttribute("href", `?status=${s}`);
    await expect(card).not.toHaveAttribute("aria-current", /.*/);
  }
});
