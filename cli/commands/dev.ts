import { Command } from "@cliffy/command";
import { fromFileUrl, join, resolve } from "#std/path";
import { discover } from "../../server/src/core/business/discover/mod.ts";
import { buildClient } from "../../framework/.sprig/compiler/build.ts";
import { generatePreviews } from "../lib/generate-previews.ts";
import { materializeWorkbench } from "../lib/workbench.ts";
import { ensureRunner } from "../lib/runner.ts";
import { openBrowser } from "../lib/process.ts";
import { formatProblems } from "../lib/format.ts";
import {
  clearLive,
  declaredParent,
  findLive,
  foreignWarning,
  type Health,
  IDLE_EXIT_ENV,
  idleExitMinutes,
  parentEnv,
  probeHealth,
  reuseBanner,
  terminate,
  watchParent,
  writeLive,
} from "../../framework/.sprig/supervise.ts";

const REPO = fromFileUrl(new URL("../../", import.meta.url)); // install root (framework + app template live here)

/** The workbench working dir for this run — per repo-branch (`sprig dev` sets SPRIG_WB_ROOT via
 *  spawnWorkbench), so no two projects/branches ever share `app/src/_preview` or the build output.
 *  A bare `isolate dev` (no supervisor) falls back to the legacy shared install dir. */
function workbenchRoot(): string {
  return Deno.env.get("SPRIG_WB_ROOT") ?? REPO;
}

/** Poll the server's identity endpoint until it answers (ready for real), or give up when
 *  the child exits first or `ms` pass. */
async function waitHealthy(
  child: Deno.ChildProcess,
  port: number,
  ms: number,
): Promise<Health | null> {
  let exited = false;
  child.status.then(() => exited = true);
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !exited) {
    const h = await probeHealth(port, 500);
    if (h) return h;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

export const devCmd = new Command()
  .description(
    "Discover a sprig project's components, generate previews, and serve the workbench.",
  )
  .option("--no-open", "Don't auto-open the browser.")
  .option(
    "-f, --force",
    "Preview the valid components even if some configs are malformed.",
  )
  .action(async (opts) => {
    const o = opts as unknown as {
      root: string;
      open: boolean;
      force?: boolean;
    };
    const root = resolve(o.root);
    const wbRoot = workbenchRoot();
    // A private workbench (SPRIG_WB_ROOT) gets a live-server record; the legacy shared
    // install dir is not a place to leave one.
    const privateWb = Deno.env.has("SPRIG_WB_ROOT");

    // REQ-005 — a workbench whose server is still up is reused, never doubled. Before any
    // work: the live server already watches the project and regenerates its own previews.
    if (privateWb) {
      const live = await findLive(wbRoot);
      if (live && resolve(live.project) === root) {
        console.log(reuseBanner(live));
        if (o.open) openBrowser(live.url);
        return;
      }
      if (live) console.error(foreignWarning(live, wbRoot));
    }

    // 1. discover the sprig folder-components + their isolate/ fixtures
    const { entries, problems } = await discover(root);
    if (entries.length === 0) {
      console.log(
        "Nothing to isolate — no folder-component has an isolate/ folder yet.",
      );
      return;
    }
    // "unsupported" notes (e.g. a case using the not-yet-supported _mocks) are
    // advisory — the case still previews. Only real config errors are fatal.
    const fatal = problems.filter((p) => p.kind !== "unsupported");
    const advisory = problems.filter((p) => p.kind === "unsupported");
    if (advisory.length) {
      console.error(
        `ℹ ${advisory.length} case(s) use features not yet supported (rendered without them):\n\n${
          formatProblems(advisory, root)
        }\n`,
      );
    }
    if (fatal.length) {
      console.error(
        `✗ isolate found ${fatal.length} config problem(s):\n\n${
          formatProblems(fatal, root)
        }\n`,
      );
      if (!o.force) {
        console.error(
          "Fix these and re-run, or `isolate dev --force` to preview the valid ones anyway.",
        );
        Deno.exit(1);
      }
      console.error("Continuing anyway (--force).\n");
    }

    await ensureRunner();

    // 2. materialize this repo-branch's OWN workbench dir, then generate one sprig preview per case
    //    into it (no Vite, no copy-a-Fresh-app). Keyed by SPRIG_WB_ROOT so a second project/branch
    //    can never clobber these previews or the build output.
    const wbApp = await materializeWorkbench(wbRoot, root);
    const appSrc = join(wbApp, "src");
    const n = await generatePreviews(entries, appSrc, resolve(root, "src"));
    console.log(
      `Generated ${n} preview page(s) for ${entries.length} component(s).`,
    );

    // 3. build the workbench app IN-PROCESS (code-split islands + scope CSS + the HMR client) →
    //    <wbRoot>/static. Previously this shelled out `deno run framework/cli.ts build`, which
    //    cold-loads the ENTIRE cli graph (compiler + keep + the 561KB vendored apexcharts) it never
    //    needs — ~230ms warm, seconds cold. buildClient is the whole non-rune build; it derives its
    //    own forcedImportMap from <wbApp>/src, so no --config subprocess is needed.
    const built = await buildClient(join(wbApp, "src"), join(wbRoot, "static"));
    console.log(
      `sprig build: ${built.islands.length} island chunk(s) [${
        built.islands.join(", ")
      }] + ` +
        `${built.chunks.length} shared chunk(s) → ${join(wbRoot, "static")} (${
          (built.bytes / 1024).toFixed(1)
        }kb, v=${built.hash})`,
    );

    // 4. serve the single origin: the sprig shell + the generated previews + the in-process
    //    keep backend (discovery for the sidebar + the test runner), wrapped in the compiler's
    //    dev server (serve-dev.ts) so editing a component hot-swaps it in the stage — HMR.
    //    SPRIG_WB_ROOT tells serve-dev.ts which per-key app + static to serve.
    const port = Number(Deno.env.get("PORT") ?? 8000);
    // Unattended (stdin not a terminal: an agent, CI, a `… &` job) → the server expires
    // after SPRIG_IDLE_EXIT minutes idle (default 30). At a terminal it never does.
    const idleMinutes = idleExitMinutes(
      Deno.env.get(IDLE_EXIT_ENV),
      Deno.stdin.isTerminal(),
    );
    const child = new Deno.Command("deno", {
      // --config the GENERATED workbench deno.json (not REPO's): it carries the project's `$.*`
      // aliases ($, $.services/, $.pages/, …) that serve-dev.ts's createRenderer needs to
      // dynamically import each preview target. Without it the SSR import resolves `$.services/*`
      // against REPO/deno.json (which has no `$.*`) and dies with "not in import map". The build
      // step above already resolves these via the app's config; the serve step must match.
      args: [
        "serve",
        "-A",
        "--unstable-kv",
        "--config",
        join(wbApp, "deno.json"),
        `--port=${port}`,
        resolve(REPO, "serve-dev.ts"),
      ],
      cwd: REPO,
      env: {
        ...Deno.env.toObject(),
        ISOLATE_PROJECT: root,
        SPRIG_DEV: "1",
        SPRIG_WB_ROOT: wbRoot,
        [IDLE_EXIT_ENV]: String(idleMinutes),
        ...parentEnv(), // the server watches us: if we vanish, it exits on its own
      },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    }).spawn();

    // REQ-004 — the server must not outlive this process: not on Ctrl-C, not on `kill`,
    // not when our own parent disappears. A bare SIGTERM is not enough for `deno serve`
    // (it waits for the never-ending HMR streams), hence terminate(): SIGTERM → grace →
    // SIGKILL. Then the record goes, then we exit.
    let stopping = false;
    const stop = async (code: number, why: string): Promise<void> => {
      if (stopping) return;
      stopping = true;
      console.log(
        `\n  isolate: ${why} — stopping the dev server (pid ${child.pid})`,
      );
      await terminate(child, 2000);
      if (privateWb) await clearLive(wbRoot);
      Deno.exit(code);
    };
    const signals = [["SIGINT", 130], ["SIGTERM", 143], [
      "SIGHUP",
      129,
    ]] as const;
    for (const [sig, code] of signals) {
      try {
        Deno.addSignalListener(sig, () => void stop(code, `${sig} received`));
      } catch { /* signal not supported here */ }
    }
    const parent = declaredParent();
    if (parent) {
      watchParent(
        parent,
        () => void stop(0, `parent process ${parent} exited`),
      );
    }

    // IPv4-explicit on purpose: `deno serve` binds 0.0.0.0 (IPv4 only), while browsers and
    // fetch resolve `localhost` → ::1 first — in environments with a stale ::1 listener that
    // 404s, every request silently misses this server. Print (and open) the exact address.
    const url = `http://127.0.0.1:${port}/`;
    // "ready" is said when it is true: the server answers its identity endpoint.
    const health = await waitHealthy(child, port, 90_000);
    if (!health) {
      const st = await Promise.race([
        child.status,
        new Promise<null>((r) => setTimeout(() => r(null), 100)),
      ]);
      if (st) {
        console.error(
          `✗ isolate: the dev server exited before it was ready (exit ${st.code}) — see the error above.`,
        );
        if (privateWb) await clearLive(wbRoot);
        Deno.exit(st.code || 1);
      }
      console.error(
        `✗ isolate: the dev server did not answer on ${url} within 90s.`,
      );
      await stop(1, "never became ready");
      return;
    }
    if (privateWb) {
      await writeLive(wbRoot, {
        pid: Deno.pid,
        serverPid: child.pid,
        port,
        url,
        project: root,
        wbRoot,
        startedAt: health.startedAt,
      });
    }
    console.log(
      `\n  ◆ isolate ready → ${url}\n     project: ${root}` +
        (idleMinutes > 0
          ? `\n     unattended: exits after ${idleMinutes} min idle (${IDLE_EXIT_ENV}=0 keeps it)`
          : "") +
        `\n`,
    );
    if (o.open) openBrowser(url);

    // The server ended on its own — an idle exit (0) or a crash (its code). Drop the record
    // and finish with it, so the whole `sprig isolate` chain finishes too (REQ-006).
    const st = await child.status;
    if (privateWb) await clearLive(wbRoot);
    Deno.exit(st.code);
  });
