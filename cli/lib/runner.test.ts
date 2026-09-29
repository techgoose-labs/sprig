// REQ-007 (integration) — ensureRunner() on a REAL filesystem, with a stub `npm`
// on PATH standing in for the network. Proves: the runner lands where the
// resolution rule says; a HOME that can't be written (a box's Landlock
// allow-list — the reported failure) no longer matters once XDG_CACHE_HOME is
// set; a provisioned legacy ~/.isolate-runner is reused; ISOLATE_RUNNER_HOME
// wins; and a dir that can't be created is a warning + not-ok, never a crash.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { join } from "#std/path";
import { ensureRunner } from "./runner.ts";

// `init -y` writes package.json; `i <pkg>…` creates exactly what ensureRunner
// verifies. STUB_NPM_FAIL=1 makes every install fail (the "incomplete" path).
const STUB_NPM = `#!/bin/sh
case "$1" in
  init) printf '{"name":"stub"}\\n' > package.json ;;
  i|install)
    if [ -n "$STUB_NPM_FAIL" ]; then exit 1; fi
    shift
    for p in "$@"; do
      case "$p" in
        @playwright/test*)
          [ -n "$STUB_NPM_LOG" ] && echo "i $p" >> "$STUB_NPM_LOG"
          [ -n "$STUB_NPM_SLOW" ] && sleep 1
          mkdir -p node_modules/.bin node_modules/@playwright/test
          printf '{"version":"%s"}\\n' "\${p#@playwright/test@}" > node_modules/@playwright/test/package.json
          printf '#!/bin/sh\\necho "Version 1.0.0"\\n' > node_modules/.bin/playwright
          chmod +x node_modules/.bin/playwright ;;
        rxjs*) mkdir -p node_modules/rxjs ;;
      esac
    done ;;
esac
exit 0
`;
const STUB_PLAYWRIGHT = `#!/bin/sh\necho "Version 1.0.0"\n`;

const ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "XDG_CACHE_HOME",
  "ISOLATE_RUNNER_HOME",
  "PATH",
  "STUB_NPM_FAIL",
  "STUB_NPM_LOG",
  "STUB_NPM_SLOW",
  "PLAYWRIGHT_BROWSERS_PATH",
] as const;

interface Sandbox {
  root: string;
  home: string;
  cache: string;
  warnings: string[];
  restore(): Promise<void>;
}

async function sandbox(opts: {
  readOnlyHome?: boolean;
  xdg?: boolean;
  runnerHome?: string;
  failInstall?: boolean;
  slowInstall?: boolean;
} = {}): Promise<Sandbox> {
  const root = await Deno.makeTempDir({ prefix: "isolate-runner-it-" });
  const home = join(root, "home");
  const cache = join(root, "cache");
  const bin = join(root, "bin");
  for (const d of [home, cache, bin]) await Deno.mkdir(d);
  await Deno.writeTextFile(join(bin, "npm"), STUB_NPM, { mode: 0o755 });
  await Deno.writeTextFile(join(bin, "playwright"), STUB_PLAYWRIGHT, {
    mode: 0o755,
  });

  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = Deno.env.get(k);
  const set = (k: string, v: string | undefined) =>
    v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
  set("HOME", home);
  set("USERPROFILE", undefined);
  set("XDG_CACHE_HOME", opts.xdg ? cache : undefined);
  set("ISOLATE_RUNNER_HOME", opts.runnerHome);
  set("STUB_NPM_FAIL", opts.failInstall ? "1" : undefined);
  set("STUB_NPM_LOG", join(root, "npm.log"));
  set("STUB_NPM_SLOW", opts.slowInstall ? "1" : undefined);
  set("PATH", `${bin}:${saved.PATH ?? ""}`);
  set("PLAYWRIGHT_BROWSERS_PATH", join(root, "browsers"));
  await Deno.mkdir(join(root, "browsers"));
  if (opts.readOnlyHome) await Deno.chmod(home, 0o555);

  const warnings: string[] = [];
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = (...a: unknown[]) => warnings.push(a.map(String).join(" "));
  console.log = () => {}; // the "Setting up…" progress lines

  return {
    root,
    home,
    cache,
    warnings,
    async restore() {
      console.warn = origWarn;
      console.log = origLog;
      for (const k of ENV_KEYS) set(k, saved[k]);
      await Deno.chmod(home, 0o755).catch(() => {});
      await Deno.remove(root, { recursive: true });
    },
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** A runner dir that looks provisioned: what an existing install left behind. */
async function provision(dir: string, testVersion = "1.0.0"): Promise<void> {
  await Deno.mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
  await Deno.mkdir(join(dir, "node_modules", "@playwright", "test"), { recursive: true });
  await Deno.writeTextFile(
    join(dir, "node_modules", "@playwright", "test", "package.json"),
    JSON.stringify({ version: testVersion }),
  );
  await Deno.mkdir(join(dir, "node_modules", "rxjs"), { recursive: true });
  await Deno.writeTextFile(join(dir, "package.json"), "{}");
  await Deno.writeTextFile(
    join(dir, "node_modules", ".bin", "playwright"),
    STUB_PLAYWRIGHT,
    { mode: 0o755 },
  );
}

// chmod can't lock root out; these two are meaningless (and would fail) as uid 0.
const notRoot = Deno.uid() !== 0;

Deno.test({
  name:
    "REQ-007: read-only HOME + XDG_CACHE_HOME (a box) => provisioned under $XDG_CACHE_HOME/sprig/isolate-runner, nothing under $HOME",
  ignore: !notRoot,
  fn: async () => {
    const sb = await sandbox({ readOnlyHome: true, xdg: true });
    try {
      const r = await ensureRunner();
      const dir = join(sb.cache, "sprig", "isolate-runner");
      assertEquals(r, { ok: true, dir });
      assert(await exists(join(dir, "node_modules", ".bin", "playwright")));
      assert(await exists(join(dir, "node_modules", "rxjs")));
      assert(await exists(join(dir, "node_modules", "isolate-events")));
      assert(!(await exists(join(sb.home, ".isolate-runner"))));
      assertEquals(sb.warnings, []);
    } finally {
      await sb.restore();
    }
  },
});

Deno.test("REQ-007: a provisioned legacy ~/.isolate-runner is reused — nothing new is created", async () => {
  const sb = await sandbox({ xdg: true });
  try {
    const legacy = join(sb.home, ".isolate-runner");
    await provision(legacy);
    const r = await ensureRunner();
    assertEquals(r, { ok: true, dir: legacy });
    assert(await exists(join(legacy, "node_modules", "isolate-events")));
    assert(!(await exists(join(sb.cache, "sprig"))));
    assertEquals(sb.warnings, []);
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-007: ISOLATE_RUNNER_HOME wins, even over a provisioned legacy dir", async () => {
  const sb0 = await sandbox();
  const explicit = join(sb0.root, "explicit-runner");
  await sb0.restore();
  const sb = await sandbox({ xdg: true, runnerHome: explicit });
  try {
    await provision(join(sb.home, ".isolate-runner"));
    const r = await ensureRunner();
    assertEquals(r, { ok: true, dir: explicit });
    assert(await exists(join(explicit, "node_modules", ".bin", "playwright")));
    assert(!(await exists(join(sb.cache, "sprig"))));
  } finally {
    await Deno.remove(explicit, { recursive: true }).catch(() => {});
    await sb.restore();
  }
});

Deno.test({
  name:
    "REQ-007: a runner dir that can't be created is a warning naming the dir + the knobs, not a crash",
  ignore: !notRoot,
  fn: async () => {
    // no XDG override: the preferred dir is ~/.cache/…, and HOME is read-only
    const sb = await sandbox({ readOnlyHome: true });
    try {
      const r = await ensureRunner();
      const dir = join(sb.home, ".cache", "sprig", "isolate-runner");
      assertEquals(r, { ok: false, dir });
      const w = sb.warnings.join("\n");
      assertStringIncludes(w, dir);
      assertStringIncludes(w, "ISOLATE_RUNNER_HOME");
      assertStringIncludes(w, "XDG_CACHE_HOME");
    } finally {
      await sb.restore();
    }
  },
});

Deno.test("REQ-007: the runner-incomplete warning names the resolved dir (the `cd … && npm i` fix)", async () => {
  const sb = await sandbox({ xdg: true, failInstall: true });
  try {
    const r = await ensureRunner();
    const dir = join(sb.cache, "sprig", "isolate-runner");
    assertEquals(r, { ok: false, dir });
    assertStringIncludes(sb.warnings.join("\n"), `cd ${dir} && npm i`);
  } finally {
    await sb.restore();
  }
});

// REQ-007 AMENDMENT 2 — the system playwright's version is taken WHOLE, prerelease
// suffix included: a box whose `playwright` is 1.64.0-alpha-… has the browsers for
// that alpha, and "1.64.0" (or "latest") installs a @playwright/test that wants a
// different Chromium build and cannot launch.
Deno.test("REQ-007 AMENDMENT 2: playwrightVersionOf keeps a prerelease suffix, reads a plain version, and is undefined on junk", async () => {
  const { playwrightVersionOf } = await import("./runner.ts");
  assertEquals(playwrightVersionOf("Version 1.64.0-alpha-1789764292000\n"), "1.64.0-alpha-1789764292000");
  assertEquals(playwrightVersionOf("Version 1.63.0"), "1.63.0");
  assertEquals(playwrightVersionOf("Version 1.65.0-beta.2\n"), "1.65.0-beta.2");
  assertEquals(playwrightVersionOf("command not found"), undefined);
});

// REQ-007 AMENDMENT 2 — a runner whose @playwright/test no longer matches the system
// playwright is reinstalled at the system version (its browsers are the ones on the
// box); one that matches is left alone; two provisioners of one dir take turns.
async function npmLog(sb: Sandbox): Promise<string> {
  try {
    return await Deno.readTextFile(join(sb.root, "npm.log"));
  } catch {
    return "";
  }
}

Deno.test("REQ-007 AMENDMENT 2: a stale runner (0.9.0 vs system 1.0.0) is reinstalled at the system version", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  Deno.env.set("ISOLATE_RUNNER_HOME", dir);
  try {
    await provision(dir, "0.9.0");
    const r = await ensureRunner();
    assertEquals(r.ok, true);
    assertStringIncludes(await npmLog(sb), "i @playwright/test@1.0.0");
    const pkg = JSON.parse(await Deno.readTextFile(join(dir, "node_modules", "@playwright", "test", "package.json")));
    assertEquals(pkg.version, "1.0.0");
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-007 AMENDMENT 2: a runner that matches the system version is not reinstalled", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  Deno.env.set("ISOLATE_RUNNER_HOME", dir);
  try {
    await provision(dir, "1.0.0");
    const r = await ensureRunner();
    assertEquals(r.ok, true);
    assert(!(await npmLog(sb)).includes("@playwright/test"), await npmLog(sb));
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-007 AMENDMENT 2: two concurrent provisioners of one fresh dir install @playwright/test once", async () => {
  const sb = await sandbox({ runnerHome: "", slowInstall: true });
  const dir = join(sb.root, "runner");
  Deno.env.set("ISOLATE_RUNNER_HOME", dir);
  try {
    const [a, b] = await Promise.all([ensureRunner(), ensureRunner()]);
    assertEquals(a.ok && b.ok, true);
    const installs = (await npmLog(sb)).split("\n").filter((l) => l.includes("@playwright/test"));
    assertEquals(installs.length, 1, await npmLog(sb));
    assert(!(await exists(join(dir, ".provisioning"))), "lock left behind");
  } finally {
    await sb.restore();
  }
});

// REQ-007 AMENDMENT 3 — several playwrights on PATH, one browser cache: the runner
// takes the one whose Chromium build is actually installed, not the first one.
async function fakePlaywright(dir: string, version: string, revision: string) {
  await Deno.mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
  await Deno.mkdir(join(dir, "node_modules", "playwright-core"), { recursive: true });
  await Deno.writeTextFile(
    join(dir, "node_modules", "playwright-core", "browsers.json"),
    JSON.stringify({ browsers: [{ name: "chromium", revision }, { name: "chromium-headless-shell", revision }] }),
  );
  await Deno.writeTextFile(join(dir, "node_modules", ".bin", "playwright"), `#!/bin/sh\necho "Version ${version}"\n`, { mode: 0o755 });
  return join(dir, "node_modules", ".bin");
}

Deno.test("REQ-007 AMENDMENT 3: of two playwrights on PATH, the one whose chromium build is in PLAYWRIGHT_BROWSERS_PATH wins", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  Deno.env.set("ISOLATE_RUNNER_HOME", dir);
  try {
    const first = await fakePlaywright(join(sb.root, "repo"), "1.63.0", "1243");
    const second = await fakePlaywright(join(sb.root, "global"), "1.64.0-alpha-1", "1246");
    await Deno.mkdir(join(sb.root, "browsers", "chromium_headless_shell-1246"));
    Deno.env.set("PATH", `${first}:${second}:${Deno.env.get("PATH")}`);
    const { choosePlaywright } = await import("./runner.ts");
    const c = await choosePlaywright();
    assertEquals(c.ver, "1.64.0-alpha-1");
    assertStringIncludes(c.why, "1246");
    const r = await ensureRunner();
    assertEquals(r.ok, true);
    assertStringIncludes(await npmLog(sb), "i @playwright/test@1.64.0-alpha-1");
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-007 AMENDMENT 3: when no candidate's build is installed, the first on PATH is taken and the gap is said", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  Deno.env.set("ISOLATE_RUNNER_HOME", dir);
  try {
    const first = await fakePlaywright(join(sb.root, "repo"), "1.63.0", "1243");
    Deno.env.set("PATH", `${first}:${Deno.env.get("PATH")}`);
    const { choosePlaywright } = await import("./runner.ts");
    const c = await choosePlaywright();
    assertEquals(c.ver, "1.63.0");
    assertStringIncludes(c.why, "not installed");
    assertStringIncludes(c.why, "playwright install");
  } finally {
    await sb.restore();
  }
});
