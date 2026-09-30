import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";
const TEXT = "Extra blanket at night — he runs cold.";

// E5 + E6 — a 500 removes the pending note, puts the text back, keeps the author,
// and edits the page's `toasts` channel with the error toast.
test("500 rolls the note back into the box and raises an error toast", async ({ page }) => {
  await page.goto(`${BASE}/pages/dog-detail/dog-notes/rolled-back`);
  await waitHydrated(page);
  const island = page.locator('sprig-island[data-sel="dog-notes"]');
  const note = island.locator('input[name="text"]');
  const author = island.locator('input[name="author"]');
  await expect(note).toHaveValue(TEXT);
  const req = page.waitForRequest((r) =>
    r.method() === "POST" && /\/api\/dog\/add-note$/.test(new URL(r.url()).pathname)
  );
  await island.getByRole("button", { name: "Add note" }).click();
  expect((await req).postDataJSON()).toEqual({ id: "d01", text: TEXT, author: "Front desk" });
  // durable end state after the 500
  await expect.poll(async () => await island.locator(".badge").textContent(), { timeout: 5000 }).toBe("3");
  await expect(island.locator("li.dog-notes-item")).toHaveCount(3);
  await expect(island.locator("li.dog-notes-pending")).toHaveCount(0);
  await expect(note).toHaveValue(TEXT);
  await expect(author).toHaveValue("Front desk");
  const toasts = await page.evaluate(() => {
    const el = document.querySelector('sprig-island[data-sel="dog-notes"]') as unknown as {
      __sprigScope?: { toasts?: () => unknown };
    };
    return el.__sprigScope?.toasts?.() ?? null;
  });
  expect(toasts).toEqual([
    { kind: "error", msg: "Note for Biscuit wasn't saved — it's back in the box." },
  ]);
});
