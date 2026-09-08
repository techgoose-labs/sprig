// The D-7 codemod's rules. Each case is one thing it must or must not do.

import { assertEquals } from "@std/assert";
import { rewriteSource } from "./wire-paths.ts";

const only = (src: string) => rewriteSource(src).out;

Deno.test("prefixes a route-space path", () => {
  assertEquals(only('be.get("/users")'), 'be.get("/api/users")');
  assertEquals(
    only('be.post("/orders/place")'),
    'be.post("/api/orders/place")',
  );
});

Deno.test("sees through a generic argument — the shape a naive pattern misses", () => {
  // This is the form the real bug took: `.get<{ ok: boolean }>("/orders/health")`
  // has no `(` after `get`, so a `\.get\(` pattern reports a false all-clear.
  assertEquals(
    only('be.get<{ ok: boolean }>("/orders/health")'),
    'be.get<{ ok: boolean }>("/api/orders/health")',
  );
  assertEquals(only('be.fetch<Res>("/x")'), 'be.fetch<Res>("/api/x")');
});

Deno.test("leaves a path that is ALREADY a wire path", () => {
  for (const p of ["/api/users", "/api", "/auth/me", "/auth"]) {
    assertEquals(only(`be.get("${p}")`), `be.get("${p}")`, p);
  }
});

Deno.test("does not mistake a prefix for a namespace", () => {
  // `/apiary` starts with "/api" as a STRING but is not under the namespace.
  assertEquals(only('be.get("/apiary/bees")'), 'be.get("/api/apiary/bees")');
  assertEquals(only('be.get("/authors/1")'), 'be.get("/api/authors/1")');
});

Deno.test("leaves the app root alone", () => {
  // "/" is a UI path, not a backend route.
  assertEquals(only('be.get("/")'), 'be.get("/")');
});

Deno.test("REPORTS a path it cannot resolve rather than guessing", () => {
  const src = "be.get(`/orders/${id}`);\nbe.fetch(path);";
  const r = rewriteSource(src, "svc.ts");
  assertEquals(r.out, src, "nothing computed is rewritten");
  assertEquals(r.manual.length, 2);
  assertEquals(r.manual[0].line, 1);
  assertEquals(r.manual[1].line, 2);
});

Deno.test("reports each rewrite with a line number", () => {
  const r = rewriteSource('const a = 1;\nbe.get("/users");\n', "svc.ts");
  assertEquals(r.hits.length, 1);
  assertEquals(r.hits[0], {
    file: "svc.ts",
    line: 2,
    before: '"/users"',
    after: '"/api/users"',
  });
});

Deno.test("is idempotent — running it twice changes nothing the second time", () => {
  const once = only('be.get("/users")');
  assertEquals(only(once), once);
});

Deno.test("does not touch an unrelated method call that happens to take a path", () => {
  // `.map`, `.includes`, a user's own `.load` — only the client's verbs.
  assertEquals(only('router.load("/users")'), 'router.load("/users")');
  assertEquals(only('list.includes("/users")'), 'list.includes("/users")');
});
