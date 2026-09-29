// REQ-030 — the optimistic-writes lint: in an island's logic.ts, a server call
// awaited before the first signal write is an error unless `// sprig-wait:`.
import { assertEquals, assertMatch } from "@std/assert";
import { lintOptimisticSource } from "./optimistic-writes.ts";

const lintOps = (src: string, ops: Record<string, string>) =>
  lintOptimisticSource(
    src,
    "islands/todo/logic.ts",
    new Map(Object.entries(ops)),
  );

const lint = (src: string) =>
  lintOptimisticSource(src, "islands/todo/logic.ts");

Deno.test("REQ-030: awaiting fetch before the signal write is an error at the await", () => {
  const r = lint(
    `import { defineComponent, signal } from "@techgoose-labs/sprig";
export default defineComponent({
  setup: () => {
    const done = signal(false);
    const toggle = async () => {
      const res = await fetch("/api/todo/toggle", { method: "POST" });
      done.set(await res.json());
    };
    return { done, toggle };
  },
});
`,
  );
  assertEquals(r.findings.length, 1);
  const f = r.findings[0];
  assertEquals(
    [f.rule, f.file, f.line, f.col, f.severity],
    ["optimistic-writes", "islands/todo/logic.ts", 6, 19, "error"],
  );
  assertMatch(f.message, /server write awaited before the UI changed/);
  assertMatch(f.message, /toggle/);
  assertMatch(f.hint, /optimistic\(sig, next, call\)/);
  assertMatch(f.hint, /sprig-wait: <reason>/);
});

Deno.test("REQ-030: client.<x>(), .fetch(POST), .post(), .put() awaited first are errors too — class methods included", () => {
  const r = lint(`export default class Todo {
  items = signal([]);
  async a() { await client.addTodo({ title: "x" }); this.items.set([]); }
  async b() { const r = await this.http.post("/x", {}); this.items.update((x) => x); }
  async c() { await backend.fetch("/api/x", { method: "DELETE" }); this.items.value = []; }
  async d() { const r = await api.put("/x"); this.items([1]); }
}
`);
  assertEquals(r.findings.map((f) => f.line), [3, 4, 5, 6]);
});

Deno.test("REQ-030: writing the signal first, or going through optimistic(), is clean", () => {
  const r = lint(`const items = signal([]);
const pending = signal(false);
export const add = async (t) => {
  items.update((xs) => [...xs, t]);
  await fetch("/api/add", { method: "POST", body: JSON.stringify(t) });
};
export async function remove(id) {
  await optimistic(items, (xs) => xs.filter((x) => x.id !== id), () =>
    client.removeTodo({ id })
  ).done;
}
`);
  assertEquals(r.findings, []);
});

Deno.test("REQ-030: a handler that never writes a signal is exempt", () => {
  const r = lint(`const items = signal([]);
export async function download() {
  const res = await fetch("/api/export");
  location.href = URL.createObjectURL(await res.blob());
}
`);
  assertEquals(r.findings, []);
});

Deno.test("REQ-030: an awaited non-server call (a timer, a local promise) before the write is fine", () => {
  const r = lint(`const open = signal(false);
export async function later() {
  await new Promise((r) => setTimeout(r, 10));
  open.set(true);
}
`);
  assertEquals(r.findings, []);
});

Deno.test("REQ-030: a nested callback is its own function — the outer body's order is judged alone", () => {
  const r = lint(`const n = signal(0);
export default defineComponent({
  setup: () => {
    const load = async () => {
      n.set(1);
      await fetch("/api/x", { method: "POST" });
    };
    const inner = async () => {
      const go = async () => { await fetch("/api/y"); };
      n.set(2);
      await go();
    };
    return { n, load, inner };
  },
});
`);
  assertEquals(
    r.findings,
    [],
    "go() writes no signal; inner writes before its own await",
  );
});

Deno.test("REQ-030: a callback that awaits then writes is caught inside the callback", () => {
  const r = lint(`const n = signal(0);
export function wire(btn) {
  btn.addEventListener("click", async () => {
    const r = await fetch("/api/n", { method: "PATCH" });
    n.set(await r.json());
  });
}
`);
  assertEquals(r.findings.map((f) => f.line), [4]);
});

Deno.test("REQ-030: // sprig-wait: <reason> suppresses and is listed with its reason", () => {
  const r = lint(`const card = signal(null);
export async function pay() {
  // sprig-wait: payment auth — the result is unknowable client-side
  const res = await fetch("/api/pay", { method: "POST" });
  card.set(await res.json());
}
export async function charge() {
  const res = await fetch("/api/charge", { method: "POST" }); // sprig-wait: server-generated receipt id
  card.set(await res.json());
}
`);
  assertEquals(r.findings, []);
  assertEquals(r.suppressed, [
    {
      file: "islands/todo/logic.ts",
      line: 4,
      reason: "payment auth — the result is unknowable client-side",
    },
    {
      file: "islands/todo/logic.ts",
      line: 8,
      reason: "server-generated receipt id",
    },
  ]);
});

Deno.test("REQ-030: a bare // sprig-wait with no reason does not suppress", () => {
  const r = lint(`const card = signal(null);
export async function pay() {
  // sprig-wait:
  const res = await fetch("/api/pay", { method: "POST" });
  card.set(await res.json());
}
`);
  assertEquals(r.findings.length, 1);
  assertEquals(r.suppressed, []);
});

Deno.test("REQ-030: fetch in a string or comment is not a call", () => {
  const r = lint(`const msg = signal("");
export async function a() {
  await log("fetch(/api) is how it works"); // await fetch("/x")
  msg.set("hi");
}
`);
  assertEquals(r.findings, []);
});

// ── REQ-030 AMENDMENT: the spinner flag, queries vs commands, service objects ──

Deno.test("REQ-030: a loading flag set first does not excuse a write that waits on the server", () => {
  const r = lint(`const loading = signal(false);
const items = signal([]);
export async function save(t) {
  loading.set(true);
  const res = await fetch("/api/todos", { method: "POST", body: JSON.stringify(t) });
  items.set(await res.json());
  loading.set(false);
}
`);
  assertEquals(r.findings.map((f) => [f.line, f.severity]), [[6, "error"]]);
  assertMatch(
    r.findings[0].message,
    /the UI changed only after the server answered/,
  );
  assertMatch(
    r.findings[0].message,
    /reconcile\(\) applies the server's projection/,
  );
});

Deno.test("REQ-030: server READS legitimately await — fetch with no method or GET, .get(), a query-named api call", () => {
  const r = lint(`const q = signal("");
const results = signal([]);
export async function search(text) {
  q.set(text);
  const res = await fetch("/api/search?q=" + text);
  results.set(await res.json());
}
export async function more() {
  const res = await fetch("/api/page/2", { method: "GET" });
  results.update((xs) => [...xs, ...res]);
}
export async function reload() {
  results.set(await http.get("/api/items"));
}
export async function refresh() {
  results.set(await this.api.listItems());
}
`);
  assertEquals(r.findings, []);
  assertEquals(r.exempt.queries, 4);
});

Deno.test("REQ-030: service objects — a write verb callee or an api/client/backend receiver is a server write", () => {
  const r = lint(`const items = signal([]);
export class Todos {
  async a(t) { const x = await this.api.save(t); items.set(x); }
  async b(t) { await todoService.create(t); items.set([]); }
  async c() { await backend.submitOrder(); items.set([]); }
  async d(t) { await store.remove(t); items.set([]); }
  async e() { await this.todoApi.archiveAll(); items.set([]); }
}
`);
  assertEquals(r.findings.map((f) => f.line), [3, 4, 5, 6, 7]);
});

Deno.test("REQ-030: a body that calls optimistic() owns its post-await writes (reconcile)", () => {
  const r = lint(`const items = signal([]);
const note = signal("");
export async function add(t) {
  const w = optimistic(items, (xs) => [...xs, t], () => client.addTodo(t));
  await this.api.save(t);
  note.set("saved");
}
`);
  assertEquals(r.findings, []);
});

Deno.test("REQ-030: // sprig-wait: on the await covers the writes after it, listed at the await", () => {
  const r = lint(`const loading = signal(false);
const receipt = signal("");
export async function pay() {
  loading.set(true);
  const res = await fetch("/api/pay", { method: "POST" }); // sprig-wait: payment auth
  receipt.set(await res.text());
}
`);
  assertEquals(r.findings, []);
  assertEquals(r.suppressed, [{
    file: "islands/todo/logic.ts",
    line: 5,
    reason: "payment auth",
  }]);
});

Deno.test("REQ-030: with openapi operations, client.<op> is a write only when its method is not GET", () => {
  const src = `const items = signal([]);
export async function load() { items.set(await client.listTodos()); }
export async function add(t) { const x = await client.addTodo(t); items.set(x); }
export async function odd() { await client.mystery(); items.set([]); }
`;
  const r = lintOps(src, { listTodos: "GET", addTodo: "POST" });
  assertEquals(r.findings.map((f) => f.line), [3, 4]);
  assertEquals(
    r.unknownOps,
    ["mystery"],
    "an op openapi.json does not know is a write, named",
  );
  const blind = lint(src);
  assertEquals(
    blind.findings.map((f) => f.line),
    [2, 3, 4],
    "no openapi: every client.<op> is a write",
  );
});

Deno.test("REQ-030: functions that await a server write but write no signal are counted as exempt", () => {
  const r = lint(`const n = signal(0);
export async function a() { await fetch("/x", { method: "POST" }); }
export function b() { return 1; }
export function c() { n.set(1); }
`);
  assertEquals(r.exempt.noWrite, 1);
});
