// REQ-004 / REQ-005 / REQ-006 (e2e) — the real `sprig isolate` on the fixture app:
// the whole chain (cli.ts isolate → cli/main.ts dev → deno serve serve-dev.ts)
// stops on SIGTERM even with an HMR client attached, stops when the top process
// is SIGKILLed, a second run on the same workbench reuses the first server, and
// an unattended workbench exits on its own (report 20260917T203646Z-w354-31439).
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

const REPO = new URL("../../", import.meta.url).pathname;
const CLI = join(REPO, "framework", "cli.ts");
const FIXTURE = join(REPO, "fixtures", "sprig-app");
const HEALTH = "/__sprig/isolate";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A HOME whose Playwright runner looks installed, so `isolate dev` skips npm. */
async function seedHome(): Promise<string> {
  const home = await Deno.makeTempDir({ prefix: "sprig-e2e-home-" });
  const mods = join(home, ".isolate-runner", "node_modules");
  await Deno.mkdir(join(mods, ".bin"), { recursive: true });
  await Deno.mkdir(join(mods, "rxjs"), { recursive: true });
  await Deno.writeTextFile(join(home, ".isolate-runner", "package.json"), "{}");
  const pw = join(mods, ".bin", "playwright");
  await Deno.writeTextFile(pw, "#!/bin/sh\necho '{}'\n");
  await Deno.chmod(pw, 0o755);
  return home;
}

function freePort(): number {
  for (let i = 0; i < 50; i++) {
    const p = 20000 + Math.floor(Math.random() * 20000);
    try {
      Deno.listen({ port: p }).close();
      return p;
    } catch { /* taken */ }
  }
  throw new Error("no free port");
}

interface Run {
  child: Deno.ChildProcess;
  out: { text: string };
}

function startIsolate(env: Record<string, string>): Run {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--unstable-kv",
      "--config",
      join(REPO, "deno.json"),
      CLI,
      "isolate",
      FIXTURE,
      "--no-open",
    ],
    cwd: REPO,
    env: { ...Deno.env.toObject(), NO_COLOR: "1", ...env },
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const out = { text: "" };
  const pump = async (s: ReadableStream<Uint8Array>) => {
    const dec = new TextDecoder();
    try {
      for await (const c of s) out.text += dec.decode(c);
    } catch { /* closed */ }
  };
  pump(child.stdout);
  pump(child.stderr);
  return { child, out };
}

async function probe(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${HEALTH}`, {
      signal: AbortSignal.timeout(400),
    });
    await r.body?.cancel();
    return r.ok;
  } catch {
    return false;
  }
}

async function waitHealthy(run: Run, port: number, ms = 150_000) {
  const t0 = Date.now();
  let exited = false;
  run.child.status.then(() => exited = true);
  while (Date.now() - t0 < ms) {
    if (await probe(port)) return;
    if (exited) break;
    await sleep(300);
  }
  throw new Error(
    `workbench never answered on ${port} (exited=${exited}):\n${run.out.text}`,
  );
}

async function waitFor(pred: () => Promise<boolean>, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pred()) return true;
    await sleep(200);
  }
  return await pred();
}

/** The `deno serve` processes of workbench `wb` (their --config names it). */
async function servers(wb: string): Promise<number[]> {
  const out = await new Deno.Command("ps", {
    args: ["-eo", "pid,args"],
    stdout: "piped",
    stderr: "null",
  }).output();
  const needle = join(wb, "app", "deno.json");
  return new TextDecoder().decode(out.stdout).split("\n")
    .filter((l) => l.includes(needle) && l.includes("serve-dev.ts"))
    .map((l) => Number(l.trim().split(/\s+/)[0]));
}

async function reap(wb: string, run?: Run) {
  try {
    run?.child.kill("SIGKILL");
  } catch { /* gone */ }
  for (const pid of await servers(wb)) {
    try {
      Deno.kill(pid, "SIGKILL");
    } catch { /* gone */ }
  }
}

async function exitedWithin(run: Run, ms: number) {
  return await Promise.race([
    run.child.status.then(() => true),
    sleep(ms).then(() => false),
  ]);
}

Deno.test({
  name:
    "REQ-004/REQ-005 (e2e): SIGTERM stops the whole chain with an HMR client attached; a second run reuses the first server",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const home = await seedHome();
    const wb = join(home, "wb");
    const port = freePort();
    const env = {
      HOME: home,
      SPRIG_HOME: home,
      SPRIG_WB_ROOT: wb,
      PORT: String(port),
    };
    const a = startIsolate(env);
    try {
      await waitHealthy(a, port);
      assertEquals((await servers(wb)).length, 1);

      // REQ-005: same workbench → reuse, exit 0, nothing new started
      const b = startIsolate(env);
      assert(await exitedWithin(b, 60_000), `second run hung:\n${b.out.text}`);
      const bs = await b.child.status;
      assertEquals(bs.code, 0, b.out.text);
      assertStringIncludes(b.out.text, "already running");
      assertStringIncludes(b.out.text, `127.0.0.1:${port}`);
      assertEquals(
        (await servers(wb)).length,
        1,
        "the second run started a server",
      );

      // a browser is attached (the HMR event stream stays open)
      const sse = await fetch(`http://127.0.0.1:${port}/_sprig/hmr`);
      const reader = sse.body!.getReader();
      await reader.read();

      // REQ-004: the documented `kill <pid>` takes the whole chain down
      a.child.kill("SIGTERM");
      assert(
        await exitedWithin(a, 15_000),
        "sprig isolate did not exit on SIGTERM",
      );
      assert(
        await waitFor(async () => !(await probe(port)), 8_000),
        "the dev server is still answering after SIGTERM",
      );
      assertEquals(await servers(wb), [], "a serve-dev.ts survived SIGTERM");
      let live = true;
      try {
        await Deno.stat(join(wb, "isolate.json"));
      } catch {
        live = false;
      }
      assert(!live, "isolate.json was left behind");
      reader.cancel().catch(() => {});
    } finally {
      await reap(wb, a);
      await Deno.remove(home, { recursive: true }).catch(() => {});
    }
  },
});

Deno.test({
  name:
    "REQ-004 (e2e): SIGTERM aimed straight at the dev server ends it and finishes the chain (the live-box zombie)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const home = await seedHome();
    const wb = join(home, "wb");
    const port = freePort();
    const a = startIsolate({
      HOME: home,
      SPRIG_HOME: home,
      SPRIG_WB_ROOT: wb,
      PORT: String(port),
    });
    try {
      await waitHealthy(a, port);
      const [serverPid] = await servers(wb);
      assert(serverPid > 1, "no serve-dev.ts found for the workbench");
      // a browser attached AND the watchers running — the box's exact state
      const sse = await fetch(`http://127.0.0.1:${port}/_sprig/hmr`);
      const reader = sse.body!.getReader();
      await reader.read();
      Deno.kill(serverPid, "SIGTERM"); // what `kill <pid>` on the stray does
      assert(
        await waitFor(async () => (await servers(wb)).length === 0, 3_000),
        "the dev server is a headless zombie: SIGTERM closed nothing but its port",
      );
      assert(
        await exitedWithin(a, 10_000),
        `the chain above the dead server never finished:\n${a.out.text}`,
      );
      assertEquals((await a.child.status).code, 0, a.out.text);
      assert(!(await probe(port)), "port still answering");
      reader.cancel().catch(() => {});
    } finally {
      await reap(wb, a);
      await Deno.remove(home, { recursive: true }).catch(() => {});
    }
  },
});

Deno.test({
  name:
    "REQ-004 (e2e): SIGKILL of the top process still takes the dev server down",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const home = await seedHome();
    const wb = join(home, "wb");
    const port = freePort();
    const a = startIsolate({
      HOME: home,
      SPRIG_HOME: home,
      SPRIG_WB_ROOT: wb,
      PORT: String(port),
    });
    try {
      await waitHealthy(a, port);
      a.child.kill("SIGKILL");
      await a.child.status;
      assert(
        await waitFor(async () => !(await probe(port)), 10_000),
        "the dev server outlived its SIGKILLed parent",
      );
      assert(
        await waitFor(async () => (await servers(wb)).length === 0, 5_000),
        "a serve-dev.ts survived the parent's SIGKILL",
      );
    } finally {
      await reap(wb, a);
      await Deno.remove(home, { recursive: true }).catch(() => {});
    }
  },
});

Deno.test({
  name:
    "REQ-006 (e2e): an unattended workbench exits on its own after the idle limit",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const home = await seedHome();
    const wb = join(home, "wb");
    const port = freePort();
    const a = startIsolate({
      HOME: home,
      SPRIG_HOME: home,
      SPRIG_WB_ROOT: wb,
      PORT: String(port),
      SPRIG_IDLE_EXIT: "0.05", // 3 seconds
    });
    try {
      await waitHealthy(a, port);
      assert(
        await exitedWithin(a, 40_000),
        `still running after the idle limit:\n${a.out.text}`,
      );
      const st = await a.child.status;
      assertEquals(st.code, 0, a.out.text);
      assertStringIncludes(a.out.text, "no requests for");
      assertEquals(await servers(wb), []);
    } finally {
      await reap(wb, a);
      await Deno.remove(home, { recursive: true }).catch(() => {});
    }
  },
});
