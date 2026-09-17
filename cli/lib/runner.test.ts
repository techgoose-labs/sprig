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
          mkdir -p node_modules/.bin
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
  set("PATH", `${bin}:${saved.PATH ?? ""}`);
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
async function provision(dir: string): Promise<void> {
  await Deno.mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
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
