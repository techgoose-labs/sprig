// lane — REQ-021: the merge gate's three test lanes, by file kind.
//
//   deno run -A scripts/lane.ts <unit|int|e2e> [--plan]
//
// A test's kind is its filename (the gate's rule, REQ-316): `*.smk.test.*` is
// smoke (never in a lane), `*.e2e.test.*` or anything under `e2e/` is e2e,
// `*.int.test.*` / `*.docker.test.*` is int, every other test file is unit.
// `--plan` prints the files the lane would run, one path per line, exit 0 —
// what the gate asks a runner that is not a bare `deno test` line. Without it
// the lane runs `deno test -A --parallel` over exactly those files and exits
// with its code. Files come from git (tracked + untracked, not ignored), so a
// fixture app's tests are reached only when git sees them.

export type Kind = "unit" | "int" | "e2e" | "smoke";
export type Lane = Exclude<Kind, "smoke">;

const TEST_NAME = /(^|\/)([^/]*[_.])?test\.(ts|tsx|mts|js|mjs|jsx)$/;

export function kindOf(path: string): Kind {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (/(^|\.)smk\.test\./.test(base)) return "smoke";
  if (/(^|\/)e2e\//.test(path) || path.startsWith("e2e/") || /(^|\.)e2e\.test\./.test(base)) return "e2e";
  if (/(^|\.)(int|docker)\.test\./.test(base)) return "int";
  return "unit";
}

export function laneFiles(lane: Lane, files: string[]): string[] {
  return files.filter((f) => TEST_NAME.test(f) && kindOf(f) === lane).sort();
}

async function gitFiles(): Promise<string[]> {
  const out = await new Deno.Command("git", {
    args: ["ls-files", "--cached", "--others", "--exclude-standard"],
    stdout: "piped",
    stderr: "inherit",
  }).output();
  if (out.code !== 0) throw new Error("lane: git ls-files failed");
  return new TextDecoder().decode(out.stdout).split("\n").filter((l) => l !== "");
}

if (import.meta.main) {
  const [lane, ...rest] = Deno.args;
  if (lane !== "unit" && lane !== "int" && lane !== "e2e") {
    console.error("usage: lane <unit|int|e2e> [--plan]");
    Deno.exit(2);
  }
  const files = laneFiles(lane, await gitFiles());
  if (rest.includes("--plan")) {
    console.log(files.join("\n"));
    Deno.exit(0);
  }
  if (files.length === 0) {
    console.error(`lane: the ${lane} lane reaches no test file`);
    Deno.exit(2);
  }
  const run = await new Deno.Command(Deno.execPath(), {
    args: ["test", "-A", "--parallel", ...files],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  Deno.exit(run.code);
}
