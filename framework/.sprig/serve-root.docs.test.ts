// REQ-013 (docs) — migrating-1x-to-2x.md §3a scopes `sprig build --ui-only` PER
// APP and states both deploy shapes. The first cut of the guide told a reader to
// point "your deploy preset's build command" at it; infra's preset is shared by
// every app it deploys, and for a generated-root app `--ui-only` emits no
// serve.ts at all — the deploy has no entrypoint (coms 20260921T190104Z-w5-80834).
import { assert, assertStringIncludes } from "@std/assert";

const DOC = new URL("../../docs/sprig/migrating-1x-to-2x.md", import.meta.url);

/** The text of §3a alone — the section that owns the customised-serve.ts
 *  story — with its prose unwrapped, so a phrase can be asserted whole. */
async function section3a(): Promise<string> {
  const doc = await Deno.readTextFile(DOC);
  const start = doc.indexOf("### 3a.");
  const end = doc.indexOf("### 3b.");
  assert(start >= 0 && end > start, "§3a / §3b headings moved");
  return doc.slice(start, end).replace(/\s+/g, " ");
}

Deno.test("REQ-013 (docs): §3a scopes --ui-only to the app's own build command, never a shared preset", async () => {
  const s = await section3a();
  assertStringIncludes(s, "sprig build --ui-only ui");
  assert(
    !s.includes("deploy preset's build command"),
    "§3a still tells the reader to switch a deploy PRESET to --ui-only",
  );
  assertStringIncludes(s, "has to stay on the composed build");
});

Deno.test("REQ-013 (docs): §3a states both deploy shapes — a generated root gitignored, a hand-owned root committed", async () => {
  const s = await section3a();
  assertStringIncludes(s, "| generated");
  assertStringIncludes(s, "| hand-owned");
  assertStringIncludes(
    s,
    "committing `serve.ts` is what makes a root hand-owned",
  );
});

// REQ-016 (docs) — the documented deploy build command must survive a HOSTED
// build. The first cut of §3a gave `sprig build --ui-only ui` as the deploy
// build command; a bare `sprig` head resolves only where `sprig install` wrote
// its launcher, and Deno Deploy's build step is a clean checkout — exit 127,
// "sprig: command not found", and a scripted `deno deploy` still reports
// success (coms 20260921T190104Z-w5-80834, the reporter's month of failed
// revisions). So §3a gives the hosted form: the same CLI run from jsr, through
// an import-map entry the build stamps with the runtime pins (REQ-017).
Deno.test("REQ-016 (docs): §3a gives the hosted-build form — the /cli import-map entry and `deno run -A @techgoose-labs/sprig/cli build --ui-only ui` — and says a bare `sprig` head exits 127 where nobody ran `sprig install`", async () => {
  const s = await section3a();
  assertStringIncludes(
    s,
    "deno run -A @techgoose-labs/sprig/cli build --ui-only ui",
  );
  assertStringIncludes(
    s,
    `"@techgoose-labs/sprig/cli": "jsr:@techgoose-labs/sprig@`,
  );
  // the same head serves a generated root's composed build
  assertStringIncludes(s, "deno run -A @techgoose-labs/sprig/cli build`");
  // why the bare head fails there, in the reporter's terms
  assertStringIncludes(s, "sprig install");
  assertStringIncludes(s, "127");
  assertStringIncludes(s, "command not found");
  // the mapped entry is kept in lockstep by the build, so the pin is not a chore
  assertStringIncludes(s, "stamp");
});

// REQ-016 AMENDMENT (docs) — §3a said the /cli pin "sits on a line the build
// stamps together with the runtime pins", right next to the HOSTED build
// command, which reads as if the hosted build keeps it current. It never can:
// a CLI run from jsr has no install root to read a version from, so its stamp
// step returns before it touches the file. Production's build is precisely the
// one the stamp cannot help — the pin you commit is the pin that ships
// (coms 20260921T190104Z-w5-80834, the reporter's closing note).
Deno.test("REQ-016 AMENDMENT (docs): §3a says, next to the hosted form, that the hosted build never restamps — the pin you commit is the pin that ships — and that only a local `sprig build` moves the /cli entry", async () => {
  const s = await section3a();
  assertStringIncludes(s, "the pin you commit is the pin that ships");
  assert(
    /hosted build itself never restamps/.test(s),
    "§3a must say the hosted build never restamps",
  );
  // next to the hosted form: after its task line, before §3a moves on
  const task = s.indexOf(
    "deno run -A @techgoose-labs/sprig/cli build --ui-only ui",
  );
  const ships = s.indexOf("the pin you commit is the pin that ships");
  const next = s.indexOf("**You wrote it only");
  assert(
    task >= 0 && task < ships,
    "the sentence belongs after the hosted task line",
  );
  assert(
    next < 0 || ships < next,
    "the sentence belongs next to the hosted form, not later in §3a",
  );
  // credit where it is due: a LOCAL build moves the entry — never "the build"
  // bare, beside a command that runs where no build ever stamps
  assertStringIncludes(s, "local `sprig build`");
  assert(
    !s.includes("a line the build stamps"),
    "§3a still says the hosted line is stamped by 'the build'",
  );
  // and why, in the reporter's terms
  assertStringIncludes(s, "no install root");
});
