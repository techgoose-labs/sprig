import { expect, test } from "@playwright/test";
import { capture } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("clicking the card emits nothing interactive", async ({ page }) => {
  const ev = await capture(page);
  await page.goto(`${BASE}/pages/dog-detail/stay-card/default`);
  await page.locator(".stay-card").click();
  await expect(
    ev.expect((e) => e.source.startsWith("button") || e.source.startsWith("a"), { timeout: 500 }),
  ).rejects.toThrow();
});
