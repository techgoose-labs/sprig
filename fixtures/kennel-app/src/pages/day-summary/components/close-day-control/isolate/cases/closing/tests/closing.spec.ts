import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

// The runner exposes the preview server as ISOLATE_BASE_URL.
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const ROUTE = `${BASE}/pages/day-summary/close-day-control`;
import { capture } from "isolate-events";

// E1 + E2 + E3 — click → confirmed wait: the reply is held 3s, so the control
// stays pending and shows no result before the server answers.
test("click sends day.close and waits, showing no result before the reply", async ({ page }) => {
  const ev = await capture(page); // before goto
  await page.goto(`${ROUTE}/closing`);
  await waitHydrated(page);
  const sent = page.waitForRequest((r) =>
    r.method() === "POST" && new URL(r.url()).pathname === "/api/day/close"
  );
  await page.locator("#close-day").click();
  // E1
  await ev.expect((e) => e.source === "button#close-day" && e.type === "click", { timeout: 3000 });
  // E3 — the request body
  const req = await sent;
  expect(req.postDataJSON()).toEqual({ id: "today", closed: true });
  // E2 — confirmed wait
  const btn = page.locator("button#close-day");
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveText(/Closing the day…/);
  await expect(btn).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("button#close-day .loading-spinner")).toBeVisible();
  await expect(page.locator(".badge")).toHaveCount(0);
});
