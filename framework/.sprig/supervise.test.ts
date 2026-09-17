// REQ-004 / REQ-005 / REQ-006 — the workbench process chain is supervised:
// children are stopped (SIGTERM → grace → SIGKILL), a dead parent is noticed,
// the live server is recorded per workbench and reused, and an unattended
// server expires. Unit tests of the seams + integration tests over real
// processes (report 20260917T203646Z-w354-31439).
import { assert, assertEquals, assertExists } from "@std/assert";
import { join, toFileUrl } from "@std/path";
import {
  clearLive,
  declaredParent,
  findLive,
  HEALTH_PATH,
  idleClock,
  idleExitMinutes,
  liveFile,
  PARENT_PID_ENV,
  terminate,
  watchParent,
  writeLive,
} from "./supervise.ts";

const REPO = new URL("../../", import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function evalChild(code: string): Deno.ChildProcess {
  return new Deno.Command(Deno.execPath(), {
    args: ["eval", code],
    stdout: "null",
    stderr: "null",
  }).spawn();
}

/** Is `pid` still a live process? (SIGCONT is a no-op on a running process.) */
function alive(pid: number): boolean {
  try {
    Deno.kill(pid, "SIGCONT");
    return true;
  } catch {
    return false;
  }
}

/** Every process whose command line mentions `needle` (ps is on every unix). */
async function psGrep(
  needle: string,
): Promise<{ pid: number; args: string }[]> {
  const out = await new Deno.Command("ps", {
    args: ["-eo", "pid,args"],
    stdout: "piped",
    stderr: "null",
  }).output();
  return new TextDecoder().decode(out.stdout).split("\n").map((l) => l.trim())
    .filter((l) => l.includes(needle) && !l.includes("ps -eo"))
    .map((l) => ({ pid: Number(l.split(/\s+/)[0]), args: l }));
}

// ───────────────────────── REQ-004: terminate() ─────────────────────────

Deno.test({
  name:
    "REQ-004 (unit): terminate() escalates to SIGKILL when SIGTERM is ignored",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const child = new Deno.Command(Deno.execPath(), {
      args: [
        "eval",
        `Deno.addSignalListener("SIGTERM", () => {}); console.log("armed"); setInterval(() => {}, 1000);`,
      ],
      stdout: "piped",
      stderr: "null",
    }).spawn();
    const reader = child.stdout.getReader();
    await reader.read(); // "armed" — the listener is installed
    reader.releaseLock();
    const t0 = Date.now();
    const status = await terminate(child, 500);
    const ms = Date.now() - t0;
    assertExists(status);
    assertEquals(status.signal, "SIGKILL");
    assert(ms >= 450 && ms < 5000, `took ${ms}ms`);
    assert(!alive(child.pid), "child still alive after terminate()");
  },
});

Deno.test({
  name:
    "REQ-004 (unit): terminate() lets a cooperative child go on SIGTERM, and is safe on a dead one",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const child = evalChild(`setInterval(() => {}, 1000);`);
    await sleep(300);
    const t0 = Date.now();
    const status = await terminate(child, 2000);
    assertExists(status);
    assertEquals(status.signal, "SIGTERM");
    assert(Date.now() - t0 < 1500, "did not exit promptly on SIGTERM");
    // a second call on the finished child must not throw
    const again = await terminate(child, 100);
    assertExists(again);
  },
});

// ───────────────────────── REQ-004: parent watchdog ─────────────────────

Deno.test("REQ-004 (unit): watchParent() fires once when the parent pid changes, then stops", async () => {
  let ppid = 4242;
  let fired = 0;
  const stop = watchParent(4242, () => fired++, {
    intervalMs: 10,
    getPpid: () => ppid,
  });
  await sleep(60);
  assertEquals(fired, 0, "fired while the parent was alive");
  ppid = 1; // re-parented → the parent died
  await sleep(80);
  assertEquals(fired, 1);
  stop();
});

Deno.test("REQ-004 (unit): declaredParent() reads SPRIG_PARENT_PID, null when unset or junk", () => {
  assertEquals(declaredParent(new Map([[PARENT_PID_ENV, "123"]])), 123);
  assertEquals(declaredParent(new Map()), null);
  assertEquals(declaredParent(new Map([[PARENT_PID_ENV, "nope"]])), null);
  assertEquals(declaredParent(new Map([[PARENT_PID_ENV, "0"]])), null);
});

Deno.test({
  name:
    "REQ-004 (integration): a child exits on its own when its parent is SIGKILLed",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "sprig-watch-" });
    const mod = toFileUrl(join(REPO, "framework", ".sprig", "supervise.ts"))
      .href;
    await Deno.writeTextFile(
      join(dir, "child.ts"),
      `import { declaredParent, watchParent } from ${JSON.stringify(mod)};
       const p = declaredParent();
       if (!p) { console.error("no parent declared"); Deno.exit(9); }
       watchParent(p, () => Deno.exit(0), { intervalMs: 100 });
       setInterval(() => {}, 1000);`,
    );
    await Deno.writeTextFile(
      join(dir, "parent.ts"),
      `import { parentEnv } from ${JSON.stringify(mod)};
       const c = new Deno.Command(Deno.execPath(), {
         args: ["run", "-A", "--config", ${
        JSON.stringify(join(REPO, "deno.json"))
      }, ${JSON.stringify(join(dir, "child.ts"))}],
         env: { ...Deno.env.toObject(), ...parentEnv() },
         stdout: "null", stderr: "inherit",
       }).spawn();
       console.log(String(c.pid));
       await c.status;`,
    );
    const parent = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--config",
        join(REPO, "deno.json"),
        join(dir, "parent.ts"),
      ],
      stdout: "piped",
      stderr: "inherit",
    }).spawn();
    const reader = parent.stdout.getReader();
    const { value } = await reader.read();
    const childPid = Number(new TextDecoder().decode(value).trim());
    assert(childPid > 1, `no child pid on stdout: ${childPid}`);
    await sleep(800); // the child's watchdog is up
    assert(alive(childPid), "child not running before the kill");
    parent.kill("SIGKILL");
    await parent.status;
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) {
      await sleep(100);
      gone = !alive(childPid);
    }
    reader.releaseLock();
    if (!gone) {
      try {
        Deno.kill(childPid, "SIGKILL");
      } catch { /* raced */ }
    }
    await Deno.remove(dir, { recursive: true });
    assert(gone, "the orphaned child kept running after its parent died");
  },
});

// ───────────────────────── REQ-005: the live-server record ──────────────

interface Identity {
  pid: number;
  project: string;
  wbRoot: string;
}

/** A stand-in dev server that answers the health probe with `id`. */
function health(id: Identity): { port: number; close(): Promise<void> } {
  const srv = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    (req) =>
      new URL(req.url).pathname === HEALTH_PATH
        ? Response.json({ ok: true, ...id, startedAt: "2026-09-17T00:00:00Z" })
        : new Response("nope", { status: 404 }),
  );
  return { port: srv.addr.port, close: () => srv.shutdown() };
}

async function tmpWb(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "sprig-wb-" });
}

Deno.test("REQ-005 (unit): findLive() returns the recorded server while it answers for this workbench", async () => {
  const wb = await tmpWb();
  const srv = health({ pid: 777, project: "/p/app", wbRoot: wb });
  try {
    await writeLive(wb, {
      pid: Deno.pid,
      serverPid: 777,
      port: srv.port,
      url: `http://127.0.0.1:${srv.port}/`,
      project: "/p/app",
      wbRoot: wb,
      startedAt: "2026-09-17T00:00:00Z",
    });
    const live = await findLive(wb);
    assertExists(live);
    assertEquals(live.port, srv.port);
    assertEquals(live.serverPid, 777);
    assertEquals(live.project, "/p/app");
    assertEquals(live.pid, Deno.pid);
  } finally {
    await srv.close();
    await Deno.remove(wb, { recursive: true });
  }
});

Deno.test("REQ-005 (unit): a record nobody answers for is stale — removed, and findLive() is null", async () => {
  const wb = await tmpWb();
  const srv = health({ pid: 1, project: "/p/app", wbRoot: wb });
  const port = srv.port;
  await srv.close(); // the server is gone; its record remains
  try {
    await writeLive(wb, {
      pid: 1,
      serverPid: 1,
      port,
      url: `http://127.0.0.1:${port}/`,
      project: "/p/app",
      wbRoot: wb,
      startedAt: "2026-09-17T00:00:00Z",
    });
    assertEquals(await findLive(wb), null);
    let exists = true;
    try {
      await Deno.stat(liveFile(wb));
    } catch {
      exists = false;
    }
    assert(!exists, "stale isolate.json was left behind");
    assertEquals(await findLive(wb), null, "no record at all → null");
  } finally {
    await Deno.remove(wb, { recursive: true });
  }
});

Deno.test("REQ-005 (unit): a different server on the recorded port is not ours — stale", async () => {
  const wb = await tmpWb();
  const other = await tmpWb();
  const srv = health({ pid: 5, project: "/p/other", wbRoot: other });
  try {
    await writeLive(wb, {
      pid: 1,
      serverPid: 5,
      port: srv.port,
      url: `http://127.0.0.1:${srv.port}/`,
      project: "/p/app",
      wbRoot: wb,
      startedAt: "2026-09-17T00:00:00Z",
    });
    assertEquals(await findLive(wb), null);
  } finally {
    await srv.close();
    await Deno.remove(wb, { recursive: true });
    await Deno.remove(other, { recursive: true });
  }
});

Deno.test("REQ-005 (unit): findLive() reports the live server's project, so a foreign project is detectable", async () => {
  const wb = await tmpWb();
  const srv = health({ pid: 9, project: "/p/other-app", wbRoot: wb });
  try {
    await writeLive(wb, {
      pid: 1,
      serverPid: 9,
      port: srv.port,
      url: `http://127.0.0.1:${srv.port}/`,
      project: "/p/other-app",
      wbRoot: wb,
      startedAt: "2026-09-17T00:00:00Z",
    });
    const live = await findLive(wb);
    assertExists(live);
    assertEquals(live.project, "/p/other-app");
  } finally {
    await srv.close();
    await Deno.remove(wb, { recursive: true });
  }
});

Deno.test("REQ-004 (unit): clearLive() removes only the record this process wrote", async () => {
  const wb = await tmpWb();
  try {
    const rec = {
      pid: Deno.pid + 1,
      serverPid: 2,
      port: 1,
      url: "http://127.0.0.1:1/",
      project: "/p",
      wbRoot: wb,
      startedAt: "2026-09-17T00:00:00Z",
    };
    await writeLive(wb, rec);
    await clearLive(wb); // not ours (pid differs) → left alone
    await Deno.stat(liveFile(wb));
    await writeLive(wb, { ...rec, pid: Deno.pid });
    await clearLive(wb);
    let exists = true;
    try {
      await Deno.stat(liveFile(wb));
    } catch {
      exists = false;
    }
    assert(!exists, "our own record was not removed");
    await clearLive(wb); // idempotent
  } finally {
    await Deno.remove(wb, { recursive: true });
  }
});

// ───────────────────────── REQ-006: the idle policy ─────────────────────

Deno.test("REQ-006 (unit): idleExitMinutes() — off at a terminal, 30 min unattended, env overrides", () => {
  assertEquals(idleExitMinutes(undefined, true), 0);
  assertEquals(idleExitMinutes(undefined, false), 30);
  assertEquals(idleExitMinutes("0", false), 0);
  assertEquals(idleExitMinutes("5", true), 5);
  assertEquals(idleExitMinutes("0.05", false), 0.05);
  assertEquals(idleExitMinutes("-3", false), 0);
  assertEquals(idleExitMinutes("soon", false), 30, "junk → the default");
});

Deno.test("REQ-006 (unit): idleClock() expires only with no request and no client attached", () => {
  let now = 1_000_000;
  let attached = 0;
  const clock = idleClock(1000, () => attached, () => now);
  assertEquals(clock.expired(), false);
  now += 1001;
  assertEquals(clock.expired(), true, "no request for > idle → expired");
  clock.touch(); // a request
  assertEquals(clock.expired(), false);
  now += 1001;
  attached = 1; // a browser holds the HMR stream
  assertEquals(clock.expired(), false, "an attached client keeps it alive");
  attached = 0;
  assertEquals(clock.expired(), false, "detaching restarts the idle clock");
  now += 1001;
  assertEquals(clock.expired(), true);
  assert(clock.idleFor() >= 1001);
});

// ───────────────────────── REQ-004: `isolate test` leaves no server ─────

Deno.test({
  name:
    "REQ-004 (integration): `isolate test` exits and its preview server is gone",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const home = await Deno.makeTempDir({ prefix: "sprig-home-" });
    const wb = join(home, "wb");
    // a runner that is "installed" — ensureRunner short-circuits both npm steps
    const mods = join(home, ".isolate-runner", "node_modules");
    await Deno.mkdir(join(mods, ".bin"), { recursive: true });
    await Deno.mkdir(join(mods, "rxjs"), { recursive: true });
    await Deno.writeTextFile(
      join(home, ".isolate-runner", "package.json"),
      "{}",
    );
    const pw = join(mods, ".bin", "playwright");
    await Deno.writeTextFile(
      pw,
      `#!/bin/sh\necho '{"config":{},"suites":[],"errors":[]}'\n`,
    );
    await Deno.chmod(pw, 0o755);
    const needle = join(wb, "app", "deno.json"); // the server's --config
    try {
      const p = await new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-A",
          "--unstable-kv",
          "--config",
          join(REPO, "deno.json"),
          join(REPO, "cli", "main.ts"),
          "test",
          "--root",
          join(REPO, "fixtures", "sprig-app"),
          "--json",
        ],
        cwd: REPO,
        env: {
          ...Deno.env.toObject(),
          HOME: home,
          SPRIG_WB_ROOT: wb,
          NO_COLOR: "1",
        },
        stdout: "piped",
        stderr: "piped",
      }).output();
      const err = new TextDecoder().decode(p.stderr);
      const out = new TextDecoder().decode(p.stdout);
      let report: { error?: string } | null = null;
      try {
        report = JSON.parse(out);
      } catch { /* not json */ }
      assert(report, `no JSON verdict on stdout (exit ${p.code}):\n${err}`);
      assert(
        !String(report.error ?? "").includes("preview/build stage failed"),
        `never reached the server stage: ${report.error}\n${err}`,
      );
      await sleep(500);
      const left = await psGrep(needle);
      assertEquals(
        left.map((l) => l.args),
        [],
        "the preview server outlived `isolate test`",
      );
    } finally {
      for (const l of await psGrep(needle)) {
        try {
          Deno.kill(l.pid, "SIGKILL");
        } catch { /* gone */ }
      }
      await Deno.remove(home, { recursive: true }).catch(() => {});
    }
  },
});
