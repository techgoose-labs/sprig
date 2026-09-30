import { assert, assertEquals } from "@std/assert";
import { checkContractSource, CONTRACT_HINT } from "./contract-calls.ts";

const rules = (src: string, island = false) =>
  checkContractSource(src, "x.ts", { island }).findings.map((f) =>
    `${f.rule}@${f.line}`
  );

Deno.test("REQ-022: a fetch with a string or template-literal URL is an error; a variable URL outside an island is not", () => {
  assertEquals(rules(`const r = await fetch("/api/users");`), [
    "contract-calls/literal-fetch@1",
  ]);
  assertEquals(rules("const r = await fetch(`/api/users/${id}`);"), [
    "contract-calls/literal-fetch@1",
  ]);
  assertEquals(rules(`globalThis.fetch('/api/x');`), [
    "contract-calls/literal-fetch@1",
  ]);
  assertEquals(rules(`const r = await fetch(url, init);`), []);
  assertEquals(
    rules(`// fetch("/api/users") in a comment\nconst s = "fetch('/a')";`),
    [],
  );
  assertEquals(
    rules(
      `class P { async fetch(req: Request): Promise<Response> { return req as never; } }`,
    ),
    [],
  );
});

Deno.test("REQ-022: every fetch in island logic.ts is an error, literal or not", () => {
  assertEquals(rules(`const r = await fetch(url);`, true), [
    "contract-calls/island-fetch@1",
  ]);
  assertEquals(rules(`const r = await fetch("/api/x");`, true), [
    "contract-calls/island-fetch@1",
  ]);
});

Deno.test("REQ-022: inject(Backend) must go straight into createClient(...)", () => {
  assertEquals(rules(`const api = createClient(inject(Backend));`), []);
  assertEquals(rules(`const be = inject(Backend);`), [
    "contract-calls/raw-backend@1",
  ]);
  assertEquals(rules(`class S {\n  #be = inject(Backend);\n}`), [
    "contract-calls/raw-backend@2",
  ]);
});

Deno.test("REQ-022: .get / .get<T> / .fetch on a Backend-injected value with a literal path is an error", () => {
  const src = [
    `class S {`,
    `  private readonly be: BackendClient = inject(Backend);`,
    `  a() { return this.be.get<User[]>("/api/users"); }`,
    "  b() { return this.be.fetch(`/api/users/${1}`, { method: 'POST' }); }",
    `  c(p: string) { return this.be.get(p); }`,
    `}`,
    `const d = inject(Backend).get("/api/d");`,
    `const other = new Map(); other.get("k");`,
  ].join("\n");
  assertEquals(rules(src), [
    "contract-calls/raw-backend@2",
    "contract-calls/literal-backend-path@3",
    "contract-calls/literal-backend-path@4",
    "contract-calls/raw-backend@7",
    "contract-calls/literal-backend-path@7",
  ]);
});

Deno.test("REQ-022: findings carry the typed-client hint, a column and severity error", () => {
  const [f] = checkContractSource(`  fetch("/api/a");`, "ui/src/a.ts", {
    island: false,
  }).findings;
  assertEquals(f.hint, CONTRACT_HINT);
  assert(
    CONTRACT_HINT.includes(
      "call the typed client (spec/contract/client) — reads are queries, writes are commands",
    ),
  );
  assertEquals([f.file, f.line, f.col, f.severity], [
    "ui/src/a.ts",
    1,
    3,
    "error",
  ]);
});

Deno.test("REQ-022: `// sprig-contract: <reason>` suppresses its own line and the next, listed with its reason", () => {
  const src = [
    `fetch("/healthz"); // sprig-contract: liveness probe, not an API call`,
    `// sprig-contract: third-party webhook`,
    `fetch("https://example.com/hook");`,
    `fetch("/api/still-flagged");`,
    `// sprig-contract:`,
    `fetch("/api/empty-reason-does-not-count");`,
  ].join("\n");
  const r = checkContractSource(src, "x.ts", { island: false });
  assertEquals(r.findings.map((f) => f.line), [4, 6]);
  assertEquals(r.suppressed, [
    { file: "x.ts", line: 1, reason: "liveness probe, not an API call" },
    { file: "x.ts", line: 3, reason: "third-party webhook" },
  ]);
});
