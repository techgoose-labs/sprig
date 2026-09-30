// dog-card Events: an overdue card carries the error border + the overdue badge.
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("overdue: error border and 'Overdue · 2h 15m' badge", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-card/overdue`);
  const card = page.locator(".iso-stage-page a.dog-card-root");
  await expect(card).toHaveClass(/border-error/);
  await expect(card).toHaveCSS("border-top-color", "rgb(192, 57, 43)");
  await expect(card.locator(".badge-error")).toHaveText("Overdue · 2h 15m");
  await expect(card).toHaveAttribute("href", /\/dog\/d14$/);
});
