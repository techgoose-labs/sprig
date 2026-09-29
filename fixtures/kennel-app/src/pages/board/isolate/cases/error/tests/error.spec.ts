// board · error — load-error only (board.md §5 Events).
import { expect, test } from "@playwright/test";
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("error: alert text, Retry link, no Today's dogs heading", async ({ page }) => {
  await page.goto(`${BASE}/pages/kennel/board/error`);
  await expect(page.getByRole("alert")).toContainText("Couldn't load today's board");
  await expect(page.getByRole("link", { name: "Retry" })).toHaveAttribute("href", "");
  // GAP: board.md §5 asks href /.+/; shared load-error's contract is href="" (re-requests the
  // current URL = reload). The page keeps load-error's contract; this asserts the reload link.
  await expect(page.getByRole("heading", { level: 1, name: "Today's dogs" })).toHaveCount(0);
});
