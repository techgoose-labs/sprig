// The `ui` UNIT — the sprig half of the composed app. Its handler's third
// argument is the BAG the composition root provisions per dispatch; the bag's
// `fetch` is the one in-process client, bound request-scoped into the app's
// backend context, and the request's ENVELOPE carries who the caller is.

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Frontend } from "./mod.ts";
import { identityHeaderValue } from "@techgoose-labs/bedrock";
import type { Bag, Identity, Unit } from "@techgoose-labs/bedrock";
import type { SprigApp } from "@techgoose-labs/sprig";

/** A bag, as the root would hand one over. */
function bagWith(fetch: typeof globalThis.fetch): Bag {
  // `typeof fetch` would resolve to the PARAMETER, not the global it shadows —
  // a type that references itself. Naming the global explicitly settles it.
  return { fetch, app: { name: "test" }, policy: () => "open" };
}

async function withApp(
  fn: (
    // `Unit["handler"]` rather than a hand-written signature: a unit may answer
    // SYNCHRONOUSLY (Response, not Promise<Response>), and spelling it out here
    // drifted from the real type the moment Frontend() became a Unit.
    handler: Unit["handler"],
    calls: {
      path: string;
      hadBackend: boolean;
      backends: unknown[];
      sessions: (Identity | null | undefined)[];
    },
  ) => Promise<void>,
) {
  const tmp = await Deno.makeTempDir();
  const assetsDir = join(tmp, "static");
  await Deno.mkdir(assetsDir, { recursive: true });
  await Deno.writeTextFile(join(assetsDir, "app.js"), "// bundle");
  const calls = {
    path: "",
    hadBackend: false,
    backends: [] as unknown[],
    sessions: [] as (Identity | null | undefined)[],
  };
  const app = {
    fetch: (
      req: Request,
      _info?: unknown,
      ctx?: { backend?: unknown; session?: Identity | null },
    ) => {
      calls.path = new URL(req.url).pathname;
      calls.hadBackend = Boolean(ctx?.backend);
      calls.backends.push(ctx?.backend);
      calls.sessions.push(ctx?.session);
      return Promise.resolve(
        new Response("<html>ssr</html>", {
          headers: { "content-type": "text/html" },
        }),
      );
    },
  } as unknown as SprigApp;
  try {
    await fn(Frontend({ app, assetsDir }).handler, calls);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
}

Deno.test("Frontend: total coverage — root redirects to base, unknown paths 404", async () => {
  await withApp(async (handler) => {
    const root = await handler(new Request("http://app/"));
    assertEquals(root.status, 302);
    assertEquals(new URL(root.headers.get("location")!).pathname, "/ui");
    const other = await handler(new Request("http://app/definitely-not-ours"));
    assertEquals(other.status, 404);
    await other.body?.cancel();
  });
});

Deno.test("Frontend: serves the SSR app under base; no bag → no backend in ctx (UI-only)", async () => {
  await withApp(async (handler, calls) => {
    const res = await handler(new Request("http://app/ui/home"));
    assertEquals(await res.text(), "<html>ssr</html>");
    assertEquals(calls.path, "/ui/home");
    assertEquals(
      calls.hadBackend,
      false,
      "UI-only: the backend context stays unbound",
    );
  });
});

Deno.test("Frontend: the unit declares the rows a signed-out browser must still reach", () => {
  const unit = Frontend({ base: "/ui" });
  const open = (path: string) =>
    unit.policy!.some((r) => r.path === path && r.access === "open");
  // Without these a denied user cannot load the page that would let them sign
  // in — the assets it needs are behind the same guard as the page.
  assertEquals(open("/ui/_assets/*"), true);
  assertEquals(open("/favicon.ico"), true);
  assertEquals(open("/"), true);
});

Deno.test("Frontend: ctx.session is the ENVELOPE's identity, on every channel", async () => {
  await withApp(async (handler, calls) => {
    const identity: Identity = {
      subject: "u-1",
      claims: ["admin"],
      via: "test",
    };
    // The root stamps this header after the auth unit allows the dispatch; an
    // inbound one is stripped before that, so its presence here is proof.
    await (await handler(
      new Request("http://app/ui/home", {
        headers: { "x-bedrock-identity": identityHeaderValue(identity) },
      }),
    )).body?.cancel();
    assertEquals(calls.sessions.at(-1), identity);

    // Reached openly → null, not undefined: "nobody" is an answer.
    await (await handler(new Request("http://app/ui/home"))).body?.cancel();
    assertEquals(calls.sessions.at(-1), null);
  });
});

Deno.test("Frontend: the bag's client is bound REQUEST-SCOPED — a fresh wrapper per call", async () => {
  await withApp(async (handler, calls) => {
    const provided = bagWith(
      ((_i: unknown) => Promise.resolve(new Response("x"))) as typeof fetch,
    );
    await (await handler(new Request("http://app/ui/a"), undefined, provided))
      .body?.cancel();
    await (await handler(new Request("http://app/ui/b"), undefined, provided))
      .body?.cancel();
    assertEquals(calls.backends.length, 2);
    assertEquals(calls.hadBackend, true);
    // A fresh binding per request — never the same captured instance.
    assertEquals(calls.backends[0] === calls.backends[1], false);
  });
});
