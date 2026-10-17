import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// At 375 the dog-detail page gives the card its full content column: 351px
// (the still's width). The preview stage pads the slot narrower than that, so
// the test pins the card to the page's column width before measuring.
test("the longest breed fits one line in the 351px column at 375", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${BASE}/pages/dog-detail/dog-profile-card/long-breed-375`);
  const card = page.locator(".dog-profile-card");
  await card.evaluate((el) => { (el as HTMLElement).style.width = "351px"; });
  const breed = card.locator("dl dd").first();
  await expect(breed).toHaveText("Cavalier King Charles Spaniel");
  const lines = await breed.evaluate((el) => {
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    return Math.round(el.getBoundingClientRect().height / lh);
  });
  expect(lines).toBe(1);
});
