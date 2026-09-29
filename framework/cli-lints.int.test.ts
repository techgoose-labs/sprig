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
  return {
    code: out.code,
    stdout: dec.decode(out.stdout),
    text: dec.decode(out.stdout) + dec.decode(out.stderr),
  };
}

Deno.test("REQ-048: sprig check on a dirty app runs every lint and is red", async () => {
  const app = join(REPO, "fixtures", "lints", "dirty-app", "ui");
  const r = await sprig([
    "check",
    app,
    "--root",
    join(REPO, "fixtures", "lints", "dirty-app"),
  ]);
  assertEquals(r.code, 1, r.text);
  for (
    const lint of [
      "contract-calls",
      "logic-placement",
      "tokens",
      "duplicate-templates",
      "optimistic-writes",
    ]
  ) {
    assertStringIncludes(r.text, `${lint}:`, `lint ${lint} not run`);
  }
  assertStringIncludes(r.text, "composition");
  assertStringIncludes(r.text, "[logic-placement/");
  assertStringIncludes(r.text, "sprig check: red —");
});

Deno.test("REQ-048: sprig check on a clean app runs every lint and is green", async () => {
  const app = join(REPO, "fixtures", "lints", "clean-app", "ui");
  const r = await sprig([
    "check",
    app,
    "--root",
    join(REPO, "fixtures", "lints", "clean-app"),
  ]);
  assertEquals(r.code, 0, r.text);
  for (
    const lint of [
      "contract-calls",
      "logic-placement",
      "tokens",
      "duplicate-templates",
      "optimistic-writes",
    ]
  ) {
    assertStringIncludes(r.text, `${lint}:`, `lint ${lint} not run`);
  }
  assertStringIncludes(r.text, "sprig check: green");
});

Deno.test("REQ-048: sprig map --compose prints the composition graph, --json as JSON", async () => {
  const app = join(
    REPO,
    "framework",
    ".sprig",
    "compiler",
    "fixtures",
    "composition-app",
  );
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
    "--root",
    clean,
    "--ui-src",
    join(clean, "ui", "src"),
    "--app",
    join(clean, "ui"),
  ]);
  assertEquals(ok.code, 0, ok.text);
  assertStringIncludes(ok.text, "unassigned");
  assertStringIncludes(ok.text, "composition");
  // a failing overlay: copy clean to a temp dir and drop the fail-unassigned overlay on top
  const tmp = await Deno.makeTempDir({ prefix: "spec-check-" });
  try {
    await copyDir(clean, tmp);
    await copyDir(join(REPO, "fixtures", "spec-check", "fail-unassigned"), tmp);
    const red = await sprig([
      "spec-check",
      join(tmp, "spec", "ui", "breakdown"),
      "--root",
      tmp,
    ]);
    assertEquals(red.code, 1, red.text);
    assertStringIncludes(red.text, "unassigned");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("REQ-048: a build with an unknown tag fails with one clean composition message, no stack", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprig-build-comp-" });
  try {
    await copyDir(
      join(
        REPO,
        "framework",
        ".sprig",
        "compiler",
        "fixtures",
        "composition-app",
      ),
      tmp,
    );
    const page = join(tmp, "src", "pages", "dashboard", "template.html");
    await Deno.writeTextFile(
      page,
      (await Deno.readTextFile(page)) + "\n<kpi-cardd></kpi-cardd>\n",
    );
    const r = await sprig(["build", tmp, "--ui-only", tmp]);
    assertEquals(r.code, 1, r.text);
    assertStringIncludes(r.text, "composition check failed");
    assertStringIncludes(r.text, "kpi-cardd");
    assertEquals(
      r.text.includes("    at "),
      false,
      "a stack trace leaked:\n" + r.text,
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// REQ-053 — the repo's own app is held to its own lints: `sprig check app` is
// green, and the suppressions it lists are exactly the markers app/src declares
// (a new marker, or a lint that stops honouring one, turns this red).
const APP_SUPPRESSIONS = [
  "pages/workbench/components/workbench/logic.ts",
  "pages/workbench/components/workbench/logic.ts",
  "shared-components/run-tests/logic.ts",
];

Deno.test("REQ-053: the repo's own app passes sprig check with exactly its declared suppressions", async () => {
  const app = join(REPO, "app");
  const r = await sprig(["check", app]);
  assertEquals(r.code, 0, r.text);
  assertStringIncludes(
    r.text,
    "sprig check: green — typecheck, wiring, composition, contract-calls, logic-placement, tokens, duplicate-templates, optimistic-writes",
  );
  // every `<lint>: …` summary says how many it suppressed; the listed lines are the entries
  const listed = [...r.text.matchAll(/^ {2}suppressed (\S+):(\d+) — (.+)$/gm)]
    .map((m) => ({ file: m[1], line: Number(m[2]), reason: m[3] }));
  // the markers app/src actually declares, read off the source
  const src = join(app, "src");
  const declared: { file: string; line: number; reason: string }[] = [];
  for (const file of await sourceFiles(src)) {
    const lines = (await Deno.readTextFile(join(src, file))).split("\n");
    lines.forEach((text, i) => {
      const m = text.match(
        /(?:\/\/|<!--|\/\*)\s*sprig-(?:wait|logic|contract|duplicate|shadows|token):\s*(\S.*?)\s*(?:-->|\*\/)?\s*$/,
      );
      if (m) declared.push({ file, line: i + 1, reason: m[1] });
    });
  }
  assertEquals(declared.map((d) => d.file).sort(), APP_SUPPRESSIONS);
  assertEquals(listed.length, declared.length, r.text);
  for (const d of declared) {
    // a `//` marker covers its own line and the next; the lint names the covered line
    const hit = listed.find((l) =>
      d.file.endsWith(l.file) && d.reason === l.reason &&
      (l.line === d.line || l.line === d.line + 1)
    );
    assert(
      hit,
      `marker ${d.file}:${d.line} not listed as suppressed:\n${r.text}`,
    );
  }
  for (
    const m of r.text.matchAll(/^([a-z-]+): checked .*, (\d+) suppressed$/gm)
  ) {
    if (m[1] !== "optimistic-writes") assertEquals(m[2], "0", m[0]);
  }
});

// REQ-055 — a developer who ran `sprig dev` before `sprig check` has generated
// `_preview` folders in src/; the check judges the app's own source, not them.
Deno.test("REQ-055: sprig check stays green with generated _preview folders (broken manifest, dirty island, duplicate template)", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprig-check-preview-" });
  try {
    await copyDir(join(REPO, "fixtures", "lints", "clean-app"), tmp);
    const src = join(tmp, "ui", "src");
    const plant = async (rel: string, text: string) => {
      await Deno.mkdir(dirname(join(src, rel)), { recursive: true });
      await Deno.writeTextFile(join(src, rel), text);
    };
    const form = await Deno.readTextFile(
      join(src, "pages", "orders", "components", "order-form", "template.html"),
    );
    const dirty =
      `import { defineComponent, signal } from "@techgoose-labs/sprig";
export default defineComponent({ setup: () => {
  const n = signal(0);
  const add = async () => { await fetch("/x", { method: "POST" }); n.set(n() * n()); };
  return { n, add };
} });
`;
    const plantAll = async (dir: string) => {
      await plant(`${dir}/targets/twin/template.html`, form);
      await plant(`${dir}/targets/twin/logic.ts`, dirty);
      await plant(
        `pages/${dir}/manifest.gen.ts`,
        'const n: number = "not a number";\nexport { n };\n',
      );
    };
    await plantAll("_preview");
    const r = await sprig(["check", join(tmp, "ui"), "--root", tmp]);
    assertEquals(r.code, 0, r.text);
    assertStringIncludes(r.text, "sprig check: green");
    // control: the same files outside a generated dir are judged
    await plantAll("preview");
    const red = await sprig(["check", join(tmp, "ui"), "--root", tmp]);
    assertEquals(red.code, 1, red.text);
    assertStringIncludes(
      red.text,
      "sprig check: red — typecheck, contract-calls, logic-placement, duplicate-templates, optimistic-writes",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

async function sourceFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(join(dir, rel))) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory) out.push(...await sourceFiles(dir, p));
    else if (/\.(ts|html|css)$/.test(e.name)) out.push(p);
  }
  return out.sort();
}

async function copyDir(from: string, to: string): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  for await (const e of Deno.readDir(from)) {
    const s = join(from, e.name), d = join(to, e.name);
    if (e.isDirectory) await copyDir(s, d);
    else await Deno.copyFile(s, d);
  }
}
