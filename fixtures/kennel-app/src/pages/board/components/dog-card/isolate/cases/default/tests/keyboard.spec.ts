// dog-card Events: keyboard — the card is focusable and Enter follows its href.
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("default: the card link takes focus and Enter navigates to /dog/d01", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/dog-card/default`);
  const card = page.locator(".iso-stage-page a.dog-card-root");
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dog\/d01$/);
});
