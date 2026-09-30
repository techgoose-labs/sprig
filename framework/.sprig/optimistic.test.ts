// REQ-029 — optimistic(sig, next, call): the UI moves first, the server
// catches up, and a failure rolls back to the right value, out loud.
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { signal } from "./core.ts";
import { optimistic } from "./optimistic.ts";

/** A promise the test settles by hand. */
function manual<R>() {
  let resolve!: (v: R) => void, reject!: (e: unknown) => void;
  const promise = new Promise<R>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Runs `fn` with console.error captured, returning what it logged. */
async function quietly(fn: () => Promise<void>): Promise<unknown[][]> {
  const logged: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void logged.push(a);
  try {
    await fn();
  } finally {
    console.error = orig;
  }
  return logged;
}

Deno.test("REQ-029: (a) the local write lands synchronously, before the call starts", async () => {
  const count = signal(1);
  let seenAtCall: number | undefined;
  const d = manual<void>();
  const w = optimistic(count, (n) => n + 1, () => {
    seenAtCall = count();
    return d.promise;
  });
  assertEquals(count(), 2, "same tick: the signal already holds the new value");
  assertEquals(seenAtCall, 2, "the call started after the write, not before");
  d.resolve();
  await w.done;
  assertEquals(count(), 2);
});

Deno.test("REQ-029: (a) a plain value works as `next` too", () => {
  const name = signal("a");
  optimistic(name, "b", () => new Promise<void>(() => {}));
  assertEquals(name(), "b");
});

Deno.test("REQ-029: (b) a rejection restores the previous value and fires onError(err, prev)", async () => {
  const done = signal(false);
  const d = manual<void>();
  const seen: [unknown, boolean][] = [];
  const boom = new Error("500");
  const w = optimistic(done, true, () => d.promise, {
    onError: (e, prev) => void seen.push([e, prev]),
  });
  assertEquals(done(), true);
  d.reject(boom);
  assertEquals(
    await w.done,
    undefined,
    "done resolves (never an unhandled rejection)",
  );
  assertEquals(done(), false, "rolled back");
  assertEquals(seen, [[boom, false]]);
  assertStrictEquals(w.error(), boom, "the error signal carries it as well");
});

Deno.test("REQ-029: (b) with no onError the failure is still surfaced: error signal + console.error", async () => {
  const n = signal(0);
  const boom = new Error("offline");
  let w!: ReturnType<typeof optimistic<number, void>>;
  const logged = await quietly(async () => {
    w = optimistic(n, 5, () => Promise.reject(boom));
    await w.done;
  });
  assertEquals(n(), 0);
  assertStrictEquals(w.error(), boom);
  assertEquals(logged.length, 1, "never swallowed silently");
  assert(String(logged[0][0]).includes("rolled back"));
});

Deno.test("REQ-029: (b) a call that throws synchronously is a rejection, not a crash", async () => {
  const n = signal(3);
  const boom = new Error("sync");
  const w = optimistic(n, 4, () => {
    throw boom;
  }, { onError: () => {} });
  await w.done;
  assertEquals(n(), 3);
  assertStrictEquals(w.error(), boom);
});

Deno.test("REQ-029: (c) pending is true from call start to settle, on success and on failure", async () => {
  const n = signal(0);
  const ok = manual<void>();
  const w1 = optimistic(n, 1, () => ok.promise);
  assertEquals(w1.pending(), true);
  assertEquals(w1.error(), undefined);
  ok.resolve();
  await w1.done;
  assertEquals(w1.pending(), false);

  const bad = manual<void>();
  const w2 = optimistic(n, 2, () => bad.promise, { onError: () => {} });
  assertEquals(w2.pending(), true);
  bad.reject(new Error("x"));
  await w2.done;
  assertEquals(w2.pending(), false);
});

Deno.test("REQ-029: (d) reconcile(result, prev) replaces the optimistic value with the server's", async () => {
  type Todo = { id: string; title: string };
  const todos = signal<Todo[]>([]);
  const d = manual<Todo>();
  const w = optimistic(
    todos,
    (xs) => [...xs, { id: "tmp", title: "milk" }],
    () => d.promise,
    { reconcile: (saved, prev) => [...prev, saved] },
  );
  assertEquals(todos(), [{ id: "tmp", title: "milk" }]);
  d.resolve({ id: "t-17", title: "milk" });
  assertEquals(await w.done, { id: "t-17", title: "milk" });
  assertEquals(todos(), [{ id: "t-17", title: "milk" }]);
});

Deno.test("REQ-029: (d) without reconcile the optimistic value stands on success", async () => {
  const n = signal(0);
  const w = optimistic(n, 9, () => Promise.resolve("ok"));
  assertEquals(await w.done, "ok");
  assertEquals(n(), 9);
});

Deno.test("REQ-029: (e) concurrent writes, last-write-wins: an older failure never clobbers a newer write", async () => {
  const n = signal(0);
  const a = manual<void>(), b = manual<void>();
  const wa = optimistic(n, 1, () => a.promise, { onError: () => {} });
  optimistic(n, 2, () => b.promise, { onError: () => {} });
  assertEquals(n(), 2);
  a.reject(new Error("a"));
  await wa.done;
  assertEquals(n(), 2, "the newer write still stands");
  b.reject(new Error("b"));
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(
    n(),
    0,
    "both failed: back to the last confirmed value, not A's",
  );
});

Deno.test("REQ-029: (e) the newest failing rolls back to the older write still in flight", async () => {
  const n = signal(0);
  const a = manual<void>(), b = manual<void>();
  const wa = optimistic(n, 1, () => a.promise, { onError: () => {} });
  const wb = optimistic(n, 2, () => b.promise, { onError: () => {} });
  b.reject(new Error("b"));
  await wb.done;
  assertEquals(n(), 1, "A may still succeed — show A");
  a.resolve();
  await wa.done;
  assertEquals(n(), 1);
});

Deno.test("REQ-029: (e) an older success becomes the rollback target of a newer failure, without repainting", async () => {
  const n = signal(0);
  const a = manual<number>(), b = manual<void>();
  const wa = optimistic(n, 1, () => a.promise, { reconcile: (r) => r });
  const wb = optimistic(n, 2, () => b.promise, { onError: () => {} });
  a.resolve(10);
  await wa.done;
  assertEquals(
    n(),
    2,
    "A settled under a newer write: the newer write stays on screen",
  );
  b.reject(new Error("b"));
  await wb.done;
  assertEquals(
    n(),
    10,
    "B's rollback lands on A's confirmed (reconciled) value",
  );
});

Deno.test("REQ-029: (e) a newer success supersedes an older write still in flight", async () => {
  const n = signal(0);
  const a = manual<void>(), b = manual<void>();
  const wa = optimistic(n, 1, () => a.promise, { onError: () => {} });
  const wb = optimistic(n, 2, () => b.promise);
  b.resolve();
  await wb.done;
  a.reject(new Error("late"));
  await wa.done;
  assertEquals(n(), 2, "a stale failure after a newer success changes nothing");
  assert(
    wa.error() instanceof Error,
    "but it is still surfaced on its own write",
  );
});

Deno.test("REQ-029: (e) writes to different signals are independent", async () => {
  const x = signal(0), y = signal(0);
  const a = manual<void>();
  const wa = optimistic(x, 1, () => a.promise, { onError: () => {} });
  optimistic(y, 1, () => Promise.resolve());
  a.reject(new Error("x"));
  await wa.done;
  assertEquals([x(), y()], [0, 1]);
});

Deno.test("REQ-029: (f) any signal-like accessor works — a hand-rolled one, not the framework's", async () => {
  let cell = "draft";
  const writes: string[] = [];
  const sig = Object.assign(() => cell, {
    set: (v: string) => {
      writes.push(v);
      cell = v;
    },
  });
  const w = optimistic(sig, "sent", () => Promise.reject(new Error("no")), {
    onError: () => {},
  });
  assertEquals(cell, "sent");
  await w.done;
  assertEquals(cell, "draft");
  assertEquals(writes, ["sent", "draft"]);
});

Deno.test("REQ-029: optimistic is exported from the package entry @techgoose-labs/sprig", async () => {
  const pkg = await import("@techgoose-labs/sprig");
  assertStrictEquals(pkg.optimistic, optimistic);
  const cfg = JSON.parse(
    await Deno.readTextFile(new URL("../../deno.json", import.meta.url)),
  );
  assert(
    cfg.publish.include.includes("framework/.sprig/optimistic.ts"),
    "shipped in the JSR package",
  );
});
