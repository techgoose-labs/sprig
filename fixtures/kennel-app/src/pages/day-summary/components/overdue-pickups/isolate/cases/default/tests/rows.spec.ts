// Events: rows in server order with exact copy; dog links → dog-detail.
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const URL = `${BASE}/pages/day-summary/overdue-pickups/default`;

test("two rows in server order with exact copy", async ({ page }) => {
  await page.goto(URL);
  const card = page.locator("section.overdue-pickups-card");
  await expect(card.locator("h2")).toHaveText("Overdue pickups");
  const rows = card.locator("li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Rocco");
  await expect(rows.nth(0)).toContainText("K14");
  await expect(rows.nth(0)).toContainText("Oliver Brandt · (555) 0113-4481");
  await expect(rows.nth(0)).toContainText("Overdue · 2h 15m");
  await expect(rows.nth(1)).toContainText("Olive");
  await expect(rows.nth(1)).toContainText("K18");
  await expect(rows.nth(1)).toContainText("Elena Popescu · (555) 0117-4629");
  await expect(rows.nth(1)).toContainText("Overdue · 45m");
});

test("dog names link to their detail", async ({ page }) => {
  await page.goto(URL);
  const card = page.locator("section.overdue-pickups-card");
  await expect(card.locator("a", { hasText: "Rocco" })).toHaveAttribute("href", /dog.*d14/);
  await expect(card.locator("a", { hasText: "Olive" })).toHaveAttribute("href", /dog.*d18/);
});

test("section is labelled by its heading; icons decorative", async ({ page }) => {
  await page.goto(URL);
  const card = page.locator("section.overdue-pickups-card");
  await expect(card).toHaveAttribute("aria-labelledby", "overdue-pickups-title");
  await expect(card.locator("h2#overdue-pickups-title")).toHaveCount(1);
  await expect(card.locator("svg.lucide-alarm-clock:not([aria-hidden='true'])")).toHaveCount(0);
});
