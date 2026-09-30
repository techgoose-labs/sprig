import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("soft info: tone + soft classes, one decorative icon, label", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/icon-badge/soft-info`);
  const badge = page.locator(".iso-stage-page span.badge");
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveClass(/badge-info/);
  await expect(badge).toHaveClass(/badge-soft/);
  await expect(badge).not.toHaveClass(/badge-sm/);
  await expect(badge.locator("svg")).toHaveCount(1);
  await expect(badge.locator("svg.lucide-calendar-clock")).toHaveAttribute("aria-hidden", "true");
  await expect(badge).toHaveText("Booked");
});
