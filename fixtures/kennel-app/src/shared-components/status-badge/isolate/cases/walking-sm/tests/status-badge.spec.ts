import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("walking-sm renders the small badge", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/status-badge/walking-sm`);
  const badge = page.locator(".iso-stage-page span.badge.badge-accent");
  await expect(badge).toHaveText("Walking");
  await expect(badge).toHaveClass(/badge-sm/);
});
