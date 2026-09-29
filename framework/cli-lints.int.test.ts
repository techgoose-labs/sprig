// REQ-048 (integration) — the real CLI runs every hardening check: `sprig check`
// runs the composition check and the five source lints after the typecheck and
// the wiring lint, and is red on any error finding; `sprig map --compose` prints
// the composition graph; `sprig spec-check` runs the breakdown checks; a build
// prints a composition error as one clean message.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

async function sprig(args: string[], cwd = REPO) {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: out.code, stdout: dec.decode(out.stdout), text: dec.decode(out.stdout) + dec.decode(out.stderr) };
}

Deno.test("REQ-048: sprig check on a dirty app runs every lint and is red", async () => {
  const app = join(REPO, "fixtures", "lints", "dirty-app", "ui");
  const r = await sprig(["check", app, "--root", join(REPO, "fixtures", "lints", "dirty-app")]);
  assertEquals(r.code, 1, r.text);
  for (const lint of ["contract-calls", "logic-placement", "tokens", "duplicate-templates", "optimistic-writes"]) {
    assertStringIncludes(r.text, `${lint}:`, `lint ${lint} not run`);
  }
  assertStringIncludes(r.text, "composition");
  assertStringIncludes(r.text, "[logic-placement/");
  assertStringIncludes(r.text, "sprig check: red —");
});

Deno.test("REQ-048: sprig check on a clean app runs every lint and is green", async () => {
  const app = join(REPO, "fixtures", "lints", "clean-app", "ui");
  const r = await sprig(["check", app, "--root", join(REPO, "fixtures", "lints", "clean-app")]);
  assertEquals(r.code, 0, r.text);
  for (const lint of ["contract-calls", "logic-placement", "tokens", "duplicate-templates", "optimistic-writes"]) {
    assertStringIncludes(r.text, `${lint}:`, `lint ${lint} not run`);
  }
  assertStringIncludes(r.text, "sprig check: green");
});

Deno.test("REQ-048: sprig map --compose prints the composition graph, --json as JSON", async () => {
  const app = join(REPO, "framework", ".sprig", "compiler", "fixtures", "composition-app");
  const r = await sprig(["map", app, "--compose"]);
  assertEquals(r.code, 0, r.text);
  assertStringIncludes(r.text, "composes");
  const j = await sprig(["map", app, "--compose", "--json"]);
  assertEquals(j.code, 0, j.text);
  const g = JSON.parse(j.stdout);
  assert(g.pages && g.components, "graph shape");
});

Deno.test("REQ-048: sprig spec-check runs the breakdown checks: clean is green, a failing tree is red", async () => {
  const clean = join(REPO, "fixtures", "spec-check", "clean");
  const ok = await sprig([
    "spec-check",
    join(clean, "spec", "ui", "breakdown"),
    "--root", clean,
    "--ui-src", join(clean, "ui", "src"),
    "--app", join(clean, "ui"),
  ]);
  assertEquals(ok.code, 0, ok.text);
  assertStringIncludes(ok.text, "unassigned");
  assertStringIncludes(ok.text, "composition");
  // a failing overlay: copy clean to a temp dir and drop the fail-unassigned overlay on top
  const tmp = await Deno.makeTempDir({ prefix: "spec-check-" });
  try {
    await copyDir(clean, tmp);
    await copyDir(join(REPO, "fixtures", "spec-check", "fail-unassigned"), tmp);
    const red = await sprig(["spec-check", join(tmp, "spec", "ui", "breakdown"), "--root", tmp]);
    assertEquals(red.code, 1, red.text);
    assertStringIncludes(red.text, "unassigned");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("REQ-048: a build with an unknown tag fails with one clean composition message, no stack", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprig-build-comp-" });
  try {
    await copyDir(join(REPO, "framework", ".sprig", "compiler", "fixtures", "composition-app"), tmp);
    const page = join(tmp, "src", "pages", "dashboard", "template.html");
    await Deno.writeTextFile(page, (await Deno.readTextFile(page)) + "\n<kpi-cardd></kpi-cardd>\n");
    const r = await sprig(["build", tmp, "--ui-only", tmp]);
    assertEquals(r.code, 1, r.text);
    assertStringIncludes(r.text, "composition check failed");
    assertStringIncludes(r.text, "kpi-cardd");
    assertEquals(r.text.includes("    at "), false, "a stack trace leaked:\n" + r.text);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

async function copyDir(from: string, to: string): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  for await (const e of Deno.readDir(from)) {
    const s = join(from, e.name), d = join(to, e.name);
    if (e.isDirectory) await copyDir(s, d);
    else await Deno.copyFile(s, d);
  }
}
