import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { lintLogicPlacement } from "./logic-placement.ts";
import { formatLintResult } from "./lint-types.ts";

const LINTS = fromFileUrl(
  new URL("../../../../fixtures/lints/", import.meta.url),
);
const src = (name: string) => join(LINTS, name, "ui", "src");
const rel = (name: string, file: string) => file.slice(src(name).length + 1);

Deno.test("REQ-023: a clean app's island logic.ts and page resolve.ts carry no business logic", async () => {
  const r = await lintLogicPlacement({ uiSrc: src("clean-app") });
  assertEquals(r.findings, []);
  assertEquals(r.checked.map((f) => rel("clean-app", f)), [
    "pages/orders/components/order-form/logic.ts",
    "pages/orders/resolve.ts",
  ]);
});

Deno.test("REQ-023: a dirty app's pricing, validation and data branching are named file:line with rule letters; services are out of scope", async () => {
  const r = await lintLogicPlacement({ uiSrc: src("dirty-app") });
  assertEquals(
    r.findings.map((f) => `${rel("dirty-app", f.file)}:${f.line} ${f.rule}`),
    [
      "pages/cart/components/checkout/logic.ts:10 logic-placement/a",
      "pages/cart/components/checkout/logic.ts:12 logic-placement/c",
      "pages/cart/components/checkout/logic.ts:13 logic-placement/c",
      "pages/cart/components/checkout/logic.ts:14 logic-placement/b",
      "pages/cart/resolve.ts:10 logic-placement/a",
    ],
  );
  assertEquals(
    r.suppressed.map((s) =>
      `${rel("dirty-app", s.file)}:${s.line} ${s.reason}`
    ),
    [
      "pages/cart/components/checkout/logic.ts:15 preview only, the command recomputes",
    ],
  );
  assertEquals(
    formatLintResult("logic-placement", r)[0],
    "logic-placement: checked 2 file(s) — 5 error(s), 0 warning(s), 1 suppressed",
  );
});

Deno.test("REQ-023: the logic lint runs with or without a contract; a missing ui source is reported as skipped", async () => {
  const r = await lintLogicPlacement({ uiSrc: src("no-contract-app") });
  assertEquals([r.skipped, r.findings, r.checked.length], [undefined, [], 1]);
  const gone = join(LINTS, "no-such-app", "ui", "src");
  const s = await lintLogicPlacement({ uiSrc: gone });
  assertEquals(s.skipped, `no ui source at ${gone}`);
  assertEquals(formatLintResult("logic-placement", s), [
    `logic-placement: no ui source at ${gone} — skipped`,
  ]);
});
