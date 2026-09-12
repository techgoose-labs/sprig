// REQ-003 — `sprig dev` honours the app's own host wrapper.
//
// `sprig dev` composes Bedrock({ ui, backend }) itself. An app whose PRODUCTION
// entry is its own wrapper around the generated serve.ts — extra routes an <img
// src> or a worker reaches without a token, a WebSocket — lost those routes in
// dev: every picture 404'd, and the way through was to write a second process
// (a reverse proxy in front of dev) just to get dev mode at all.
//
// So dev layers the app's host module over the composed app, exactly where prod
// has it: `routes(req, info)` is tried first, `wrap(next)` wraps the rest.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import {
  type DevHandler,
  hostArgTokens,
  hostLayer,
  layerHost,
  resolveHostEntry,
} from "./host-layer.ts";

const INFO = {
  remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 1 },
  // deno-lint-ignore no-explicit-any
} as any as Deno.ServeHandlerInfo;

const composed: DevHandler = () =>
  new Response("composed app", { status: 200 });
const req = (path: string) => new Request(`http://localhost${path}`);

async function tempHost(src: string): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "sprig-host-" });
  await Deno.writeTextFile(join(dir, "host.ts"), src);
  return dir;
}

// ── the flag ────────────────────────────────────────────────────────────────

Deno.test("REQ-003: --host's VALUE is not mistaken for the app dir", () => {
  // dev()/devSupervisor pick the app dir off the first non-flag arg — so both
  // tokens of `--host host.ts` have to be claimed, or dev runs in `./host.ts`.
  assertEquals(hostArgTokens(["--host", "host.ts"]), ["--host", "host.ts"]);
  assertEquals(hostArgTokens(["--host=host.ts"]), ["--host=host.ts"]);
  assertEquals(hostArgTokens(["ui", "--open"]), []);
  const raw = ["ui", "--host", "host.ts", "--open"];
  const claimed = hostArgTokens(raw);
  assertEquals(raw.filter((a) => !a.startsWith("-") && !claimed.includes(a)), [
    "ui",
  ]);
});

// ── finding it ──────────────────────────────────────────────────────────────

Deno.test("REQ-003: a host.ts beside serve.ts is picked up with no flag", async () => {
  const dir = await tempHost("export function routes() { return null; }\n");
  try {
    const entry = await resolveHostEntry([], dir);
    assert(entry, "auto-detect found nothing");
    assertEquals(entry.path, join(dir, "host.ts"));
    assertEquals(entry.explicit, false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-003: no host.ts and no flag → no layer, no noise", async () => {
  const dir = await Deno.makeTempDir({ prefix: "sprig-host-" });
  try {
    assertEquals(await resolveHostEntry([], dir), null);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-003: an explicit --host naming a missing file fails LOUDLY", async () => {
  const dir = await Deno.makeTempDir({ prefix: "sprig-host-" });
  try {
    const err = await resolveHostEntry(["--host", "nope.ts"], dir).then(
      () => null,
      (e: Error) => e,
    );
    assert(err, "a missing --host file was accepted");
    assertStringIncludes(err.message, "nope.ts");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// ── layering it ─────────────────────────────────────────────────────────────

Deno.test("REQ-003: routes() is tried BEFORE the composed app", async () => {
  const h = layerHost({
    routes: (r) =>
      new URL(r.url).pathname.startsWith("/files/")
        ? new Response("off disk", { status: 200 })
        : null,
  }, composed);
  assertEquals(await (await h(req("/files/p/a.png"), INFO)).text(), "off disk");
  // anything it declines still reaches the composed app
  assertEquals(await (await h(req("/ui"), INFO)).text(), "composed app");
});

Deno.test("REQ-003: wrap() wraps the composed app", async () => {
  const h = layerHost({
    wrap: (next) => async (r, i) => {
      const res = await next(r, i);
      const out = new Response(await res.text(), res);
      out.headers.set("x-host", "1");
      return out;
    },
  }, composed);
  const res = await h(req("/ui"), INFO);
  assertEquals(res.headers.get("x-host"), "1");
  assertEquals(await res.text(), "composed app");
});

Deno.test("REQ-003: with both, routes() short-circuits before wrap() sees it", async () => {
  const seen: string[] = [];
  const h = layerHost({
    routes: (r) =>
      new URL(r.url).pathname === "/sim/x" ? new Response("sim") : null,
    wrap: (next) => (r, i) => {
      seen.push(new URL(r.url).pathname);
      return next(r, i);
    },
  }, composed);
  assertEquals(await (await h(req("/sim/x"), INFO)).text(), "sim");
  assertEquals(await (await h(req("/ui"), INFO)).text(), "composed app");
  assertEquals(seen, ["/ui"]);
});

Deno.test("REQ-003: the host gets the ServeHandlerInfo, same as prod", async () => {
  let got: Deno.ServeHandlerInfo | undefined;
  const h = layerHost({
    routes: (_r, i) => {
      got = i;
      return null;
    },
  }, composed);
  await h(req("/ui"), INFO);
  assertEquals(got, INFO);
});

// ── end to end over a real file ─────────────────────────────────────────────

Deno.test("REQ-003: a real host.ts on disk is loaded and layered", async () => {
  const dir = await tempHost(`
export function routes(req: Request): Response | null {
  const p = new URL(req.url).pathname;
  if (p.startsWith("/files/")) return new Response("bytes off disk");
  return null;
}
export function wrap(next: (r: Request, i: Deno.ServeHandlerInfo) => Response | Promise<Response>) {
  return async (r: Request, i: Deno.ServeHandlerInfo) => {
    const res = await next(r, i);
    const out = new Response(await res.text(), res);
    out.headers.set("x-wrapped", "yes");
    return out;
  };
}
`);
  try {
    const layer = await hostLayer([], dir, composed);
    assert(layer, "host.ts was not layered");
    assertStringIncludes(layer.label, "host.ts");
    assertStringIncludes(layer.label, "routes");
    assertStringIncludes(layer.label, "wrap");
    assertEquals(
      await (await layer.handler(req("/files/p/a.png"), INFO)).text(),
      "bytes off disk",
    );
    const through = await layer.handler(req("/ui"), INFO);
    assertEquals(through.headers.get("x-wrapped"), "yes");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-003: an AUTO-detected host.ts with neither hook warns, never breaks dev", async () => {
  const dir = await tempHost("export const unrelated = 1;\n");
  try {
    const warnings: string[] = [];
    const layer = await hostLayer([], dir, composed, (m) => warnings.push(m));
    assertEquals(layer, null, "an unrelated host.ts hijacked dev");
    assertEquals(warnings.length, 1, warnings.join("\n"));
    assertStringIncludes(warnings[0], "host.ts");
    assertStringIncludes(warnings[0], "wrap");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-003: an EXPLICIT --host with neither hook fails loudly", async () => {
  const dir = await tempHost("export const unrelated = 1;\n");
  try {
    const err = await hostLayer(["--host", "host.ts"], dir, composed).then(
      () => null,
      (e: Error) => e,
    );
    assert(err, "an unusable --host module was accepted");
    assertStringIncludes(err.message, "wrap");
    assertStringIncludes(err.message, "routes");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
