import { expect, test } from "@playwright/test";
import { capture, waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const TEXT = "Extra blanket at night — he runs cold.";

// E9 — the seeded pending row renders dimmed with "saving…".
test("seeded pending note is dimmed and saving", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/pending`);
  await waitHydrated(page);
  const island = page.locator('sprig-island[data-sel="dog-notes"]');
  const fourth = island.locator("li.dog-notes-item").nth(3);
  await expect(fourth).toHaveCSS("opacity", "0.5");
  await expect(fourth.locator(".dog-notes-meta")).toHaveText("Front desk · saving…");
  await expect(island.locator(".badge")).toHaveText("4");
});

// E1–E3 — typing (the stream carries an input's detail as `value="<text>"`), submit, and the optimistic append while the POST is held (delay:3000).
test("submit appends at once, clears the box, and posts the intent", async ({ page }) => {
  const ev = await capture(page);
  const seen: string[] = [];
  ev.events$.subscribe((e) => seen.push(`${e.source}/${e.type}/${e.detail}`));
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/pending`);
  await waitHydrated(page);
  const island = page.locator('sprig-island[data-sel="dog-notes"]');
  const note = island.locator('input[name="text"]');
  await note.fill(TEXT);
  await ev.expect((e) => e.source.startsWith("input") && e.type === "input" && e.detail === `value="${TEXT}"`)
    .catch(() => { throw new Error("no input event; saw: " + seen.join(" | ")); });
  const req = page.waitForRequest((r) =>
    r.method() === "POST" && /\/api\/dog\/add-note$/.test(new URL(r.url()).pathname)
  );
  const t0 = Date.now();
  await island.getByRole("button", { name: "Add note" }).click();
  await ev.expect((e) => e.source.startsWith("button") && e.type === "click")
    .catch(() => { throw new Error("no click event; saw: " + seen.join(" | ")); });
  // E2's `form/submit` is not on the isolate event stream (it records the button's
  // click, never the form's submit) — the submit is proven by its effect: the POST
  // below and the optimistic append.
  const last = island.locator("li.dog-notes-item").last();
  await expect(island.locator("li.dog-notes-item")).toHaveCount(5, { timeout: 300 });
  expect(Date.now() - t0).toBeLessThan(1500);
  await expect(last).toHaveCSS("opacity", "0.5");
  await expect(last.locator(".dog-notes-meta")).toHaveText("Front desk · saving…");
  await expect(island.locator(".badge")).toHaveText("5");
  await expect(note).toHaveValue("");
  const body = (await req).postDataJSON();
  expect(body).toEqual({ id: "d01", text: TEXT, author: "Front desk" });
});
