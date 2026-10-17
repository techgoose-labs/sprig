// The git-root `deno.json` a sprig app is BORN with: the tasks `sprig init`
// writes, and the import map every composed build keeps there.
//
// Why the build task is not `sprig build`. The `sprig` on your PATH is a
// launcher `sprig install` wrote on YOUR machine (`exec deno run -A --config
// ~/.sprig/deno.json ~/.sprig/framework/cli.ts`). A deploy's build step is a
// clean checkout — Deno Deploy runs `deno task build` there — so a bare `sprig …`
// task ends at "sprig: command not found", exit 127, and a scripted
// `deno deploy` still reports success while the site stays on the last revision
// that built. That is a month of silently stale production, reported from a real
// app (coms 20260921T190104Z-w5-80834); §3a documents the fix, and this is it in
// the scaffold, so a new app is deployable without being hand-edited first.
//
// `dev` keeps the launcher on purpose: it needs the on-disk workbench that
// `sprig install` writes, it only ever runs on a developer's machine, and it is
// a LOCAL run — so it is what re-pins the three sprig entries (a CLI run from
// jsr has no install root to read a version from, so its stamp returns before
// touching the file: REQ-016 AMENDMENT). The build task moving off the launcher
// therefore does not freeze an app's pins.

/** The CLI's own subpath. The build task resolves through this mapping, and
 *  the stamp re-pins it with the runtime entries (REQ-017). */
export const SPRIG_CLI = "@techgoose-labs/sprig/cli";

/** The git-root tasks of a scaffolded app. `start` is added next to these by
 *  `ensureRuneWorkspace` (it needs the app's env/entry). */
export const ROOT_TASKS: Record<string, string> = {
  dev: "sprig dev",
  build: `deno run -A ${SPRIG_CLI} build`,
};

/** The import map the git root needs: the runtime the composed `serve.ts`
 *  imports, and the CLI its build task runs. A value the app's `ui/` package
 *  already declares wins — including a local `../sprig/framework/cli.ts`
 *  override — and `ensureWorkspace` adds each key only when the root has none,
 *  so nothing an app owns is rewritten.
 *
 *  @param uiImports the `ui/deno.json` import map, hoisted to the root
 *  @param sprigV    the version to pin sprig at when the app names none */
export function rootImports(
  uiImports: Record<string, string>,
  sprigV: string,
): Record<string, string> {
  return {
    "@techgoose-labs/bedrock": uiImports["@techgoose-labs/bedrock"] ??
      "jsr:@techgoose-labs/bedrock@^1",
    "@techgoose-labs/sprig": uiImports["@techgoose-labs/sprig"] ??
      `jsr:@techgoose-labs/sprig@${sprigV}`,
    "@techgoose-labs/sprig/bedrock":
      uiImports["@techgoose-labs/sprig/bedrock"] ??
        `jsr:@techgoose-labs/sprig@${sprigV}/bedrock`,
    [SPRIG_CLI]: uiImports[SPRIG_CLI] ??
      `jsr:@techgoose-labs/sprig@${sprigV}/cli`,
    "@std/path": uiImports["@std/path"] ?? "jsr:@std/path@^1",
    "@preact/signals-core": uiImports["@preact/signals-core"] ??
      "npm:@preact/signals-core@^1",
  };
}
