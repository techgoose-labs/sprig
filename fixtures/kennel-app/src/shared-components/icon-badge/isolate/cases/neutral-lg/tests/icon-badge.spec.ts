import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("neutral lg: badge-neutral, badge-lg, lock icon, focusable by id", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/icon-badge/neutral-lg`);
  const badge = page.locator(".iso-stage-page span.badge");
  await expect(badge).toHaveClass(/badge-neutral/);
  await expect(badge).toHaveClass(/badge-lg/);
  await expect(badge).not.toHaveClass(/badge-soft/);
  await expect(badge.locator("svg")).toHaveCount(1);
  await expect(badge.locator("svg.lucide-lock")).toHaveCount(1);
  await expect(badge).toHaveText("Day closed");
  await expect(badge).toHaveAttribute("id", "day-closed-badge");
  await expect(badge).toHaveAttribute("tabindex", "-1");
  await page.evaluate(() => document.getElementById("day-closed-badge")?.focus());
  await expect(badge).toBeFocused();
});
