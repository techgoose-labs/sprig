import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { lintContractCalls } from "./contract-calls.ts";
import { lintOptimisticWrites } from "./optimistic-writes.ts";
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
    `contract-calls: checked 2 file(s) — 0 error(s), 0 warning(s), 0 suppressed — contract: ${
      join(LINTS, "clean-app")
    }/spec/contract (git root)`,
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
    `contract-calls: checked 3 file(s) — 4 error(s), 0 warning(s), 1 suppressed — contract: ${
      join(LINTS, "dirty-app")
    }/spec/contract (git root)`,
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

Deno.test("REQ-068: an app below the git root holding its own spec/contract — contract-calls and optimistic-writes read the app root's contract and say so", async () => {
  const repo = await Deno.makeTempDir({ prefix: "req068-contract-" });
  try {
    const appRoot = join(repo, "fixtures", "web");
    const uiSrc = join(appRoot, "src");
    const src = join(LINTS, "clean-app");
    await Deno.mkdir(join(appRoot, "spec"), { recursive: true });
    await Deno.writeTextFile(join(appRoot, "deno.json"), "{}");
    const copy = async (from: string, to: string) => {
      await new Deno.Command("cp", { args: ["-R", from, to] }).output();
    };
    await copy(
      join(src, "spec", "contract"),
      join(appRoot, "spec", "contract"),
    );
    await copy(join(src, "ui", "src"), uiSrc);
    const calls = await lintContractCalls({ uiSrc, gitRoot: repo, appRoot });
    assertEquals(calls.skipped, undefined, calls.skipped);
    assertEquals(calls.notes ?? [], []); // write-method ran: the openapi.json was found
    const line = formatLintResult("contract-calls", calls)[0];
    assertStringIncludes(
      line,
      "contract-calls: checked 2 file(s) — 0 error(s)",
    );
    assertStringIncludes(
      line,
      `contract: ${join(appRoot, "spec", "contract")} (app root)`,
    );
    const writes = await lintOptimisticWrites({
      uiSrc,
      gitRoot: repo,
      appRoot,
    });
    assertStringIncludes(
      formatLintResult("optimistic-writes", writes)[0],
      `contract: ${join(appRoot, "spec", "contract")} (app root)`,
    );
    // no app contract: the git root's, named the git root
    const none = await lintContractCalls({
      uiSrc,
      gitRoot: repo,
      appRoot: repo + "/nowhere",
    });
    assertEquals(
      none.skipped,
      `no spec/contract/client at ${repo}/nowhere (app root) or ${repo} (git root)`,
    );
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
});
