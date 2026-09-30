import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("error sm: solid error tone, badge-sm, alarm-clock icon only", async ({ page }) => {
  await page.goto(`${BASE}/components/shared-components/icon-badge/error-sm`);
  const badge = page.locator(".iso-stage-page span.badge");
  await expect(badge).toHaveClass(/badge-error/);
  await expect(badge).toHaveClass(/badge-sm/);
  await expect(badge).not.toHaveClass(/badge-soft/);
  await expect(badge.locator("svg")).toHaveCount(1);
  await expect(badge.locator("svg.lucide-alarm-clock")).toHaveCount(1);
  await expect(badge).toHaveText("Overdue · 45m");
});
