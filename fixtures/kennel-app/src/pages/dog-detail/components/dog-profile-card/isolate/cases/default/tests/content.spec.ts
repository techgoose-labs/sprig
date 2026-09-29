import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("dog-profile-card renders d01's facts", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-profile-card/default`);
  const card = page.locator(".dog-profile-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator("h2")).toHaveText("The dog");
  await expect(card.locator("dl dt")).toHaveText(["Breed", "Kennel", "Arrival", "Owner", "Phone"]);
  await expect(card.locator("dl dd")).toHaveText([
    "Golden Retriever",
    "K01",
    "07:00",
    "Priya Raman",
    "(555) 0100-4000",
  ]);
  await expect(card.locator(".badge.badge-outline")).toHaveText("K01");
  await expect(card.locator("svg[aria-hidden='true']")).toHaveCount(1);
});
