import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { lintContractCalls } from "./contract-calls.ts";
import { formatLintResult } from "./lint-types.ts";

const LINTS = fromFileUrl(
  new URL("../../../../fixtures/lints/", import.meta.url),
);
const app = (name: string) => ({
  gitRoot: join(LINTS, name),
  uiSrc: join(LINTS, name, "ui", "src"),
});
const rel = (name: string, file: string) =>
  file.slice(join(LINTS, name, "ui", "src").length + 1);

Deno.test("REQ-022: a clean app with a contract client checks every ui .ts and finds nothing", async () => {
  const r = await lintContractCalls(app("clean-app"));
  assertEquals(r.skipped, undefined);
  assertEquals(r.findings, []);
  assertEquals(r.checked.map((f) => rel("clean-app", f)), [
    "pages/orders/components/order-form/logic.ts",
    "pages/orders/resolve.ts",
  ]);
  assertEquals(formatLintResult("contract-calls", r), [
    "contract-calls: checked 2 file(s) — 0 error(s), 0 warning(s), 0 suppressed",
  ]);
});

Deno.test("REQ-022: a dirty app's raw Backend, literal paths and island fetch are named file:line, the suppression listed", async () => {
  const r = await lintContractCalls(app("dirty-app"));
  assertEquals(
    r.findings.map((f) => `${rel("dirty-app", f.file)}:${f.line} ${f.rule}`),
    [
      "pages/cart/components/checkout/logic.ts:16 contract-calls/island-fetch",
      "pages/cart/resolve.ts:6 contract-calls/raw-backend",
      "pages/cart/resolve.ts:7 contract-calls/literal-backend-path",
      "services/pricing/mod.ts:6 contract-calls/literal-fetch",
    ],
  );
  assertEquals(
    r.suppressed.map((s) =>
      `${rel("dirty-app", s.file)}:${s.line} ${s.reason}`
    ),
    ["services/pricing/mod.ts:5 public FX feed, not our API"],
  );
  const out = formatLintResult("contract-calls", r);
  assertEquals(
    out[0],
    "contract-calls: checked 3 file(s) — 4 error(s), 0 warning(s), 1 suppressed",
  );
  assertEquals(
    out.filter((l) => l.startsWith("    fix: call the typed client")).length,
    4,
  );
});

Deno.test("REQ-022: with no spec/contract/client the lint reports skipped and why, and finds nothing", async () => {
  const a = app("no-contract-app");
  const r = await lintContractCalls(a);
  assertEquals(r.skipped, `no spec/contract/client at ${a.gitRoot}`);
  assertEquals([r.findings, r.suppressed, r.checked], [[], [], []]);
  assertEquals(formatLintResult("contract-calls", r), [
    `contract-calls: no spec/contract/client at ${a.gitRoot} — skipped`,
  ]);
});
