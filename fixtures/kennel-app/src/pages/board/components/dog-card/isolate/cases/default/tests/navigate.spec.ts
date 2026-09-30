// dog-card Events: click anywhere on the card navigates to that dog's detail.
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("default: the whole card is one link to the dog's detail page", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-card/default`);
  const card = page.locator(".iso-stage-page a.dog-card-root");
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("href", /\/dog\/d01$/);
  await expect(card.locator("h2.card-title")).toHaveText("Biscuit");
  await expect(card.locator(".badge-info")).toContainText("Booked");
  await expect(card.locator(".badge-error")).toHaveCount(0);
  await expect(card).not.toHaveClass(/border-error/);
});
