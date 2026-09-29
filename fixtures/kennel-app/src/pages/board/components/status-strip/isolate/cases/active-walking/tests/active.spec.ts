import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("active walking: links to all, aria-current, primary border", async ({ page }) => {
  await page.goto(`${BASE}/pages/board/status-strip/active-walking`);
  const walking = page.locator("#status-strip-walking");
  await expect(walking).toHaveAttribute("href", "?status=all");
  await expect(walking).toHaveAttribute("aria-current", "true");
  await expect(walking).toHaveCSS("border-top-color", "rgb(194, 65, 12)");
  for (const s of ["booked", "checked-in", "checked-out"]) {
    const card = page.locator(`#status-strip-${s}`);
    await expect(card).toHaveAttribute("href", `?status=${s}`);
    await expect(card).not.toHaveAttribute("aria-current", /.*/);
    await expect(card).toHaveCSS("border-top-color", "rgb(230, 215, 195)");
  }
});
