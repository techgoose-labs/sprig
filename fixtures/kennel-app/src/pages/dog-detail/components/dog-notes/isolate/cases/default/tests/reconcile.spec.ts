import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

// E4 — reconcile on success: the 200 reply replaces the pending note in place.
test("accepted note loses its dim and reads 'just now'", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/default`);
  await waitHydrated(page);
  const island = page.locator('sprig-island[data-sel="dog-notes"]');
  const note = island.locator('input[name="text"]');
  await note.fill("Extra blanket at night — he runs cold.");
  await island.getByRole("button", { name: "Add note" }).click();
  const last = island.locator("li.dog-notes-item").last();
  await expect(last.locator(".dog-notes-meta")).toHaveText("Front desk · just now", { timeout: 5000 });
  await expect(last).not.toHaveClass(/dog-notes-pending/);
  await expect(last).toHaveCSS("opacity", "1");
  await expect(last.locator(".dog-notes-text")).toHaveText("Extra blanket at night — he runs cold.");
  await expect(island.locator("li.dog-notes-item")).toHaveCount(4);
  await expect(island.locator(".badge")).toHaveText("4");
  await expect(note).toHaveValue("");
  const toasts = await page.evaluate(() => {
    const el = document.querySelector('sprig-island[data-sel="dog-notes"]') as unknown as {
      __sprigScope?: { toasts?: () => unknown };
    };
    return el.__sprigScope?.toasts?.() ?? null;
  });
  expect(toasts ?? []).toEqual([]);
});
