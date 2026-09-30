// REQ-030 — the optimistic-writes lint over real app trees on disk.
import { assertEquals, assertMatch } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { lintOptimisticWrites } from "./optimistic-writes.ts";
import { formatLintResult } from "./lint-types.ts";

const app = (name: string) =>
  fromFileUrl(
    new URL(`../../../../fixtures/lints/${name}/ui/src`, import.meta.url),
  );

const root = (name: string) =>
  fromFileUrl(new URL(`../../../../fixtures/lints/${name}`, import.meta.url));

const WAIT = {
  file: "islands/checkout/logic.ts",
  line: 10,
  reason: "payment auth — the receipt id only exists server-side",
};

Deno.test("REQ-030: the clean app passes — optimistic() and a reasoned sprig-wait, listed", async () => {
  const r = await lintOptimisticWrites({
    uiSrc: app("optimistic-clean"),
    gitRoot: root("optimistic-clean"),
  });
  assertEquals(r.skipped, undefined);
  assertEquals(r.checked, [
    "islands/checkout/logic.ts",
    "islands/todo-list/logic.ts",
    "islands/todo-toggle/logic.ts",
  ]);
  assertEquals(r.notes, [
    "client.<op>() classified by spec/contract/openapi.json (3 operations)",
    "0 function(s) await a server write but write no signal — exempt; 1 awaited server read(s) — exempt",
  ]);
  assertEquals(r.findings, []);
  assertEquals(r.suppressed, [WAIT]);
});

Deno.test("REQ-030: the dirty app fails at each awaited-first server write, file:line + fix", async () => {
  const r = await lintOptimisticWrites({
    uiSrc: app("optimistic-dirty"),
    gitRoot: root("optimistic-dirty"),
  });
  assertEquals(
    r.findings.map((f) => `${f.file}:${f.line} ${f.severity}`),
    [
      "islands/checkout/logic.ts:14 error",
      "islands/todo-list/logic.ts:14 error",
      "islands/todo-toggle/logic.ts:10 error",
    ],
  );
  assertEquals(r.suppressed, [WAIT]);
  assertMatch(
    r.notes?.[0] ?? "",
    /^no spec\/contract\/openapi\.json under .*optimistic-dirty — treating every client\.<op>\(\) as a write$/,
  );
  const printed = formatLintResult("optimistic-writes", r).join("\n");
  assertMatch(printed, /checked 3 file\(s\) — 3 error\(s\)/);
  assertMatch(
    printed,
    /islands\/todo-toggle\/logic\.ts:10:\d+ \[optimistic-writes\] server write awaited before the UI changed/,
  );
  assertMatch(printed, /fix: wrap it in optimistic\(sig, next, call\)/);
  assertMatch(
    printed,
    /suppressed islands\/checkout\/logic\.ts:10 — payment auth/,
  );
});

Deno.test("REQ-030: no island, or no ui dir, is said out loud — never a silent pass", async () => {
  const empty = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${empty}/template.html`, "<p>static</p>");
    const none = await lintOptimisticWrites({ uiSrc: empty });
    assertMatch(none.skipped ?? "", /no island logic\.ts under/);
  } finally {
    await Deno.remove(empty, { recursive: true });
  }
  const gone = await lintOptimisticWrites({ uiSrc: "/nonexistent/ui/src" });
  assertMatch(gone.skipped ?? "", /no ui source directory at \/nonexistent/);
});
