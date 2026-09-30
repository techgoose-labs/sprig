import { expect, test } from "@playwright/test";

const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("REQ-041: <html> carries the case's _theme", async ({ page }) => {
  await page.goto(`${BASE}/components/swatch/dark`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".swatch")).toHaveCSS(
    "background-color",
    "rgb(17, 17, 17)",
  );
});
