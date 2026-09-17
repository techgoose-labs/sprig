// Dev composition root for `sprig isolate` — the SAME Bedrock({ ui, backend }) as
// serve.ts, but wrapped in the compiler's dev server so component edits hot-swap. `sprig
// isolate` (cli dev) builds the workbench with --dev (which injects the HMR client) and spawns
// this under `deno serve` with SPRIG_DEV=1 + ISOLATE_PROJECT set.
//
// Two watchers cooperate: createDevServer watches the WORKBENCH src (app/src) and pushes HMR
// (template hot-swap / css swap / rebuild+reload); the project watcher below mirrors edits to
// the user's components into app/src/_preview/targets/* — which lands under app/src, so the
// dev server picks it up and hot-swaps. Structural changes (isolate/ cases, new components)
// re-discover + re-generate the previews.
import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { createDevServer } from "./framework/.sprig/compiler/dev.ts";
import { api } from "./server/bootstrap/mod.ts";
import { discover } from "./server/src/core/business/discover/mod.ts";
import { copyLogic, generatePreviews } from "./cli/lib/generate-previews.ts";
import {
  basename,
  dirname,
  fromFileUrl,
  join,
  relative,
  toFileUrl,
} from "@std/path";
import type { SprigApp } from "@techgoose-labs/sprig";
import type { SsrRenderer } from "@techgoose-labs/sprig/bedrock";
import {
  declaredParent,
  HEALTH_PATH,
  IDLE_EXIT_ENV,
  idleClock,
  watchParent,
} from "./framework/.sprig/supervise.ts";

const root = dirname(fromFileUrl(import.meta.url)); // the install root (repo or ~/.sprig)
// The WORKBENCH working dir is per repo-branch (`~/.sprig/work/<repo-branch>`), so two projects —
// or two branches/worktrees — can never share `app/src/_preview` or the build output. `sprig dev`
// sets SPRIG_WB_ROOT; a bare `deno serve serve-dev.ts` falls back to the legacy shared install dir.
const wbRoot = Deno.env.get("SPRIG_WB_ROOT") ?? root;
const appSrc = join(wbRoot, "app", "src");
const outDir = join(wbRoot, "static");
// Point the workbench renderer at its own build dir so createRenderer reads the prebuilt
// templates.json (ASTs) instead of live-parsing every template with tree-sitter at boot. Must be
// set BEFORE main.ts is imported below (createRenderer reads SPRIG_ASSETS_DIR at module-eval).
Deno.env.set("SPRIG_ASSETS_DIR", outDir);

// The workbench app is generated per-key OUTSIDE this module's dir, so import it by absolute URL
// (a static `./app/src/main.ts` would always be the install copy, defeating the isolation).
const { app, renderer } = await import(
  toFileUrl(join(appSrc, "main.ts")).href
) as {
  app: SprigApp;
  renderer: SsrRenderer;
};

// assetsDir MUST be the workbench build dir (outDir). The default is "static"
// resolved against CWD — but this process runs with cwd=<install root>, not the per-key
// workbench, so the default points at a nonexistent <install>/static and every /_assets/*
// (client.js, app.css) 404s → unstyled, no island hydration. Pin it to the dir we actually
// built into so the asset route AND the content-hash version both read the real bundle.
const handler = Bedrock({
  ui: Frontend({ app, base: "", assetsDir: outDir }),
  backend: api,
});
const dev = createDevServer({ renderer, base: "", outDir, handler });

const project = Deno.env.get("ISOLATE_PROJECT");
if (project) watchProject(join(project, "src"), project);

// ── lifetime (REQ-004 / REQ-006) ───────────────────────────────────────────────────
// This process must never outlive its reason to exist. Three exits, all announced:
//   SIGTERM/SIGINT  — `deno serve` alone shuts down GRACEFULLY: it waits for open
//                     connections, and the HMR event stream never closes, so a plain
//                     SIGTERM left this process running forever (measured; the report's
//                     orphans). Close the streams and go.
//   parent gone     — the `isolate dev` above us died without warning (SIGKILL, OOM):
//                     nobody will ever stop us, so stop ourselves.
//   idle            — unattended (the launcher sets SPRIG_IDLE_EXIT when stdin is not a
//                     terminal): no request and no browser attached for that long → exit.
const startedAt = new Date().toISOString();
let shuttingDown = false;
function shutdown(why: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`isolate: ${why} — dev server (pid ${Deno.pid}) shutting down`);
  dev.close(); // ends every HMR stream, so nothing holds the process open
  Deno.exit(0);
}
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(sig, () => shutdown(`${sig} received`));
}
const parent = declaredParent();
if (parent) {
  watchParent(parent, () => shutdown(`parent process ${parent} exited`));
}
// The launcher resolves the policy (terminal vs unattended); a bare run reads the env only.
const idleMinutes = Math.max(0, Number(Deno.env.get(IDLE_EXIT_ENV)) || 0);
const clock = idleClock(idleMinutes * 60_000, () => dev.clientCount());
if (idleMinutes > 0) {
  const every = Math.max(250, Math.min(30_000, (idleMinutes * 60_000) / 2));
  const t = setInterval(() => {
    if (clock.expired()) {
      shutdown(
        `no requests for ${idleMinutes} min and no browser attached — exiting ` +
          `(${IDLE_EXIT_ENV}=0 keeps it running)`,
      );
    }
  }, every);
  Deno.unrefTimer(t);
}

/** Mirror a user-project edit into the workbench previews so the dev server hot-swaps it.
 *  A component file (template/styles/logic) edit is copied straight into its existing
 *  `_preview/targets/<sel>/` — anything else (an isolate/ case, a brand-new component) falls
 *  back to a full re-discover + re-generate. */
async function watchProject(
  srcDir: string,
  projectRoot: string,
): Promise<void> {
  const sanitize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const targetsDir = join(appSrc, "_preview", "targets");
  const COMPONENT_FILES = new Set(["template.html", "styles.css", "logic.ts"]);

  const flush = async (batch: string[]): Promise<void> => {
    let structural = false;
    for (const p of batch) {
      const rel = relative(srcDir, p);
      if (rel.split(/[/\\]/).includes("isolate")) { // a case fixture/JSON/spec changed
        structural = true;
        continue;
      }
      const file = basename(p);
      if (!COMPONENT_FILES.has(file)) {
        structural = true; // a non-component file (or dir) changed → re-derive
        continue;
      }
      const dest = join(targetsDir, sanitize(basename(dirname(p))), file);
      try {
        await Deno.stat(dirname(dest)); // an existing preview target → mirror in place
        // logic.ts must rewrite its relative imports (the copy is relocated); see generate-previews.
        if (file === "logic.ts") await copyLogic(p, dest);
        else await Deno.copyFile(p, dest);
      } catch {
        structural = true; // not a known target (new component) → re-generate
      }
    }
    if (structural) {
      try {
        const { entries } = await discover(projectRoot);
        await generatePreviews(entries, appSrc, srcDir);
      } catch (e) {
        console.error(
          "isolate: preview re-generation failed —",
          e instanceof Error ? e.message : e,
        );
      }
    }
  };

  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  for await (const ev of Deno.watchFs(srcDir)) {
    if (ev.kind === "access") continue;
    for (const p of ev.paths) pending.add(p);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = [...pending];
      pending.clear();
      flush(batch).catch((e) => console.error("isolate watch:", e));
    }, 80);
  }
}

export default {
  fetch: (
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> | Response => {
    // Who am I? — what lets the next run on this workbench reuse this server (REQ-005)
    // and lets a launcher know "ready" is true before it says so.
    if (new URL(req.url).pathname === HEALTH_PATH) {
      return Response.json({
        ok: true,
        pid: Deno.pid,
        project: project ?? null,
        wbRoot,
        startedAt,
        idleMinutes,
      });
    }
    clock.touch();
    return dev.fetch(req, info);
  },
};
