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

interface Sandbox {
  root: string;
  home: string;
  cache: string;
  /** the env the runner is given — never the process's (REQ-021 AMENDMENT) */
  env: Record<string, string | undefined>;
  warnings: string[];
  restore(): Promise<void>;
}

async function sandbox(opts: {
  readOnlyHome?: boolean;
  xdg?: boolean;
  runnerHome?: string;
  failInstall?: boolean;
  slowInstall?: boolean;
  /** REQ-052: the sandbox's stub playwright wants chromium 1000 and, unless this is
   *  false, `chromium-1000` is in the sandbox browsers path — a box that can launch. */
  browsers?: boolean;
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
  await Deno.mkdir(join(bin, "playwright-core"));
  await Deno.writeTextFile(
    join(bin, "playwright-core", "browsers.json"),
    JSON.stringify({ browsers: [{ name: "chromium", revision: "1000" }] }),
  );

  const env: Record<string, string | undefined> = {};
  const saved = { PATH: Deno.env.get("PATH") };
  const set = (k: string, v: string | undefined) => {
    env[k] = v;
  };
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
  if (opts.browsers !== false) {
    await Deno.mkdir(join(root, "browsers", "chromium-1000"));
  }
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
    env,
    warnings,
    async restore() {
      console.warn = origWarn;
      console.log = origLog;
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
  await Deno.mkdir(join(dir, "node_modules", "@playwright", "test"), {
    recursive: true,
  });
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
      const r = await ensureRunner({ env: sb.env });
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
    const r = await ensureRunner({ env: sb.env });
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
    const r = await ensureRunner({ env: sb.env });
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
      const r = await ensureRunner({ env: sb.env });
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
    const r = await ensureRunner({ env: sb.env });
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
  assertEquals(
    playwrightVersionOf("Version 1.64.0-alpha-1789764292000\n"),
    "1.64.0-alpha-1789764292000",
  );
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
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    await provision(dir, "0.9.0");
    const r = await ensureRunner({ env: sb.env });
    assertEquals(r.ok, true);
    assertStringIncludes(await npmLog(sb), "i @playwright/test@1.0.0");
    const pkg = JSON.parse(
      await Deno.readTextFile(
        join(dir, "node_modules", "@playwright", "test", "package.json"),
      ),
    );
    assertEquals(pkg.version, "1.0.0");
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-007 AMENDMENT 2: a runner that matches the system version is not reinstalled", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    await provision(dir, "1.0.0");
    const r = await ensureRunner({ env: sb.env });
    assertEquals(r.ok, true);
    assert(!(await npmLog(sb)).includes("@playwright/test"), await npmLog(sb));
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-007 AMENDMENT 2: two concurrent provisioners of one fresh dir install @playwright/test once", async () => {
  const sb = await sandbox({ runnerHome: "", slowInstall: true });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    const [a, b] = await Promise.all([
      ensureRunner({ env: sb.env }),
      ensureRunner({ env: sb.env }),
    ]);
    assertEquals(a.ok && b.ok, true);
    const installs = (await npmLog(sb)).split("\n").filter((l) =>
      l.includes("@playwright/test")
    );
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
  await Deno.mkdir(join(dir, "node_modules", "playwright-core"), {
    recursive: true,
  });
  await Deno.writeTextFile(
    join(dir, "node_modules", "playwright-core", "browsers.json"),
    JSON.stringify({
      browsers: [{ name: "chromium", revision }, {
        name: "chromium-headless-shell",
        revision,
      }],
    }),
  );
  await Deno.writeTextFile(
    join(dir, "node_modules", ".bin", "playwright"),
    `#!/bin/sh\necho "Version ${version}"\n`,
    { mode: 0o755 },
  );
  return join(dir, "node_modules", ".bin");
}

Deno.test("REQ-007 AMENDMENT 3: of two playwrights on PATH, the one whose chromium build is in PLAYWRIGHT_BROWSERS_PATH wins", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    const first = await fakePlaywright(join(sb.root, "repo"), "1.63.0", "1243");
    const second = await fakePlaywright(
      join(sb.root, "global"),
      "1.64.0-alpha-1",
      "1246",
    );
    await Deno.mkdir(join(sb.root, "browsers", "chromium_headless_shell-1246"));
    sb.env.PATH = `${first}:${second}:${sb.env.PATH}`;
    const { choosePlaywright } = await import("./runner.ts");
    const c = await choosePlaywright(sb.env);
    assertEquals(c.ver, "1.64.0-alpha-1");
    assertStringIncludes(c.why, "1246");
    const r = await ensureRunner({ env: sb.env });
    assertEquals(r.ok, true);
    assertStringIncludes(await npmLog(sb), "i @playwright/test@1.64.0-alpha-1");
  } finally {
    await sb.restore();
  }
});

// REQ-052 — no candidate can launch a browser: a clear failure, never a silent
// fallback. ensureRunner returns ok:false and ONE warning names every candidate
// (path + version + the chromium build it wants), the browsers path searched and the
// builds present there, and the exact fix. Every env is the sandbox's own: PATH is
// the sandbox bins + /usr/bin:/bin, so the box's global playwright never leaks in.
const SYS = "/usr/bin:/bin";

async function noMatch(sb: Sandbox): Promise<string> {
  const r = await ensureRunner({ env: sb.env });
  assertEquals(
    r,
    { ok: false, dir: sb.env.ISOLATE_RUNNER_HOME ?? null },
    sb.warnings.join("\n"),
  );
  assert(
    !(await npmLog(sb)).includes("@playwright/test"),
    `installed anyway:\n${await npmLog(sb)}`,
  );
  assertEquals(sb.warnings.length, 1, sb.warnings.join("\n---\n"));
  return sb.warnings[0];
}

Deno.test("REQ-052: no playwright on PATH => ok:false naming the empty PATH search and the install fix, nothing installed", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    await Deno.remove(join(sb.root, "bin", "playwright"));
    sb.env.PATH = `${join(sb.root, "bin")}:${SYS}`;
    const w = await noMatch(sb);
    assertStringIncludes(w, "no `playwright` on PATH");
    assertStringIncludes(w, dir);
    assertStringIncludes(w, join(sb.root, "browsers"));
    assertStringIncludes(w, "chromium-1000");
    assertStringIncludes(w, "npm i -g playwright");
    assertStringIncludes(w, "playwright install chromium");
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-052: candidates whose chromium builds are all absent => ok:false naming each candidate, the builds present, and the npx fix", async () => {
  const sb = await sandbox({ runnerHome: "", browsers: false });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    const repo = await fakePlaywright(join(sb.root, "repo"), "1.63.0", "1243");
    const global = await fakePlaywright(
      join(sb.root, "global"),
      "1.64.0-alpha-1",
      "1246",
    );
    await Deno.mkdir(join(sb.root, "browsers", "chromium-1200"));
    await Deno.mkdir(join(sb.root, "browsers", "ffmpeg-1011"));
    await Deno.remove(join(sb.root, "bin", "playwright")); // bin keeps only the stub npm
    sb.env.PATH = `${repo}:${global}:${join(sb.root, "bin")}:${SYS}`;
    const w = await noMatch(sb);
    assertStringIncludes(
      w,
      `${
        join(repo, "playwright")
      } 1.63.0 — wants chromium 1243 (not installed)`,
    );
    assertStringIncludes(
      w,
      `${
        join(global, "playwright")
      } 1.64.0-alpha-1 — wants chromium 1246 (not installed)`,
    );
    assertStringIncludes(w, join(sb.root, "browsers"));
    assertStringIncludes(w, "present: chromium-1200");
    assert(!w.includes("ffmpeg"), w);
    assertStringIncludes(
      w,
      `PLAYWRIGHT_BROWSERS_PATH=${
        join(sb.root, "browsers")
      } npx playwright@1.63.0 install chromium`,
    );
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-052: PLAYWRIGHT_BROWSERS_PATH unset => the message says so and names Playwright's default cache it searched", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  sb.env.PLAYWRIGHT_BROWSERS_PATH = undefined;
  try {
    sb.env.PATH = `${join(sb.root, "bin")}:${SYS}`;
    const def = Deno.build.os === "darwin"
      ? join(sb.home, "Library", "Caches", "ms-playwright")
      : join(sb.home, ".cache", "ms-playwright");
    const w = await noMatch(sb);
    assertStringIncludes(w, "PLAYWRIGHT_BROWSERS_PATH is unset");
    assertStringIncludes(w, def);
    assertStringIncludes(w, "present: none");
    assertStringIncludes(w, "npx playwright@1.0.0 install chromium");
    // …and that default cache IS where a match is found once the build is there
    await Deno.mkdir(join(def, "chromium-1000"), { recursive: true });
    sb.warnings.length = 0;
    assertEquals(await ensureRunner({ env: sb.env }), { ok: true, dir });
    assertEquals(sb.warnings, []);
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-052: a candidate whose --version can't be parsed is listed as 'unparseable version: <text>', never dropped", async () => {
  const sb = await sandbox({ runnerHome: "", browsers: false });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    const junk = join(sb.root, "junk");
    await Deno.mkdir(junk);
    await Deno.writeTextFile(
      join(junk, "playwright"),
      `#!/bin/sh\necho "garbage out"\n`,
      { mode: 0o755 },
    );
    await Deno.remove(join(sb.root, "bin", "playwright")); // bin keeps only the stub npm
    sb.env.PATH = `${junk}:${join(sb.root, "bin")}:${SYS}`;
    const w = await noMatch(sb);
    assertStringIncludes(
      w,
      `${join(junk, "playwright")} unparseable version: garbage out`,
    );
    assertStringIncludes(w, "npm i -g playwright");
    // listed on the happy path too: a matching candidate after it still wins
    const good = await fakePlaywright(join(sb.root, "good"), "1.5.0", "1500");
    await Deno.mkdir(join(sb.root, "browsers", "chromium-1500"));
    sb.env.PATH = `${junk}:${good}:${join(sb.root, "bin")}:${SYS}`;
    const { choosePlaywright } = await import("./runner.ts");
    const c = await choosePlaywright(sb.env);
    assertEquals(c.ver, "1.5.0");
    assertStringIncludes(c.why, "unparseable version: garbage out");
  } finally {
    await sb.restore();
  }
});

Deno.test("REQ-052: happy path unchanged — the matching candidate is installed, ok:true, no warning", async () => {
  const sb = await sandbox({ runnerHome: "" });
  const dir = join(sb.root, "runner");
  sb.env.ISOLATE_RUNNER_HOME = dir;
  try {
    sb.env.PATH = `${join(sb.root, "bin")}:${SYS}`;
    assertEquals(await ensureRunner({ env: sb.env }), { ok: true, dir });
    assertStringIncludes(await npmLog(sb), "i @playwright/test@1.0.0");
    assertEquals(sb.warnings, []);
  } finally {
    await sb.restore();
  }
});
