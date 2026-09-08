// `sprig migrate wire-paths` — the D-7 codemod.
//
// Before bedrock, the in-process client mounted `/api` for you: a unit called
// `backend.get("/users")` and the client put it on the wire as `/api/users`.
// There is one client now and it takes the SAME paths a browser does, so those
// call sites are one prefix short. This rewrites them.
//
// It is deliberately CONSERVATIVE. It only touches a call whose path is a
// STRING LITERAL starting with `/`, because that is the only case where the
// destination is knowable without evaluating the program. A template literal,
// a variable, or a computed path is reported for a human to read rather than
// guessed at — a codemod that rewrites what it cannot see is worse than one
// that admits it.

import { walk } from "@std/fs";
import { relative } from "@std/path";

/** Paths that are already wire paths, or are not ours to touch. */
const ALREADY_WIRE = /^\/(api|auth)(\/|$)/;

/** A client call with a literal path: `.get("/x")`, `.fetch<T>("/x", init)`.
 *  The optional generic argument is why a naive `\.get\("` misses real bugs. */
const CALL =
  /(\.(?:get|post|put|patch|delete|fetch)\s*(?:<[^>]*>)?\(\s*)("\/[^"]*")/g;

/**
 * A call whose path this codemod cannot resolve — reported, never rewritten.
 *
 * Deliberately NARROW, because the obvious pattern is useless in a real app:
 * `.get(x)` and `.delete(x)` are also `Map`, `Set`, `URLSearchParams` and
 * `Headers`, so reporting every one of them buried the two real findings in an
 * app under 45 false positives — and a report that is mostly noise trains
 * people to skip it. Two forms are worth a human's attention:
 *
 *   1. a TEMPLATE LITERAL that starts with `/` — unambiguously a path;
 *   2. `.fetch(<not a string>)` — `fetch` is the client's own method, and no
 *      collection has one.
 */
const DYNAMIC = /(?:\.(?:get|post|put|patch|delete|fetch)\s*(?:<[^>]*>)?\(\s*`\/)|(?:\.fetch\s*(?:<[^>]*>)?\(\s*[A-Za-z_$])/g;

export interface WireHit {
  file: string;
  line: number;
  before: string;
  after: string;
}

export interface WireReport {
  rewritten: WireHit[];
  /** Call sites with a non-literal path — a human must read these. */
  manual: { file: string; line: number; text: string }[];
  filesChanged: number;
}

/** Rewrite one file's contents. Pure, so the rule is testable without a disk. */
export function rewriteSource(
  src: string,
  file = "<memory>",
): {
  out: string;
  hits: WireHit[];
  manual: { file: string; line: number; text: string }[];
} {
  const hits: WireHit[] = [];
  const lineOf = (index: number) => src.slice(0, index).split("\n").length;

  const out = src.replace(
    CALL,
    (whole, head: string, quoted: string, index: number) => {
      const path = quoted.slice(1, -1);
      if (ALREADY_WIRE.test(path)) return whole;
      // A bare "/" is the app root — a UI path, not a backend route.
      if (path === "/") return whole;
      const next = `"/api${path}"`;
      hits.push({ file, line: lineOf(index), before: quoted, after: next });
      return head + next;
    },
  );

  const manual: { file: string; line: number; text: string }[] = [];
  for (const m of src.matchAll(DYNAMIC)) {
    const line = lineOf(m.index!);
    const text = src.split("\n")[line - 1]?.trim() ?? "";
    // A variable holding an already-wire path is common and fine; we cannot
    // tell, so report it once and let a human decide.
    manual.push({ file, line, text });
  }
  return { out, hits, manual };
}

/** Walk `root`, rewrite every `.ts`, and report. `dryRun` reports only. */
export async function migrateWirePaths(
  root: string,
  opts: { dryRun?: boolean } = {},
): Promise<WireReport> {
  const rewritten: WireHit[] = [];
  const manual: WireReport["manual"] = [];
  const changed = new Set<string>();

  for await (
    const entry of walk(root, {
      exts: [".ts"],
      skip: [
        /node_modules/,
        /\.git\//,
        /\/static\//,
        /\/_preview\//,
        /\.sprig\//,
      ],
    })
  ) {
    if (!entry.isFile) continue;
    const src = await Deno.readTextFile(entry.path);
    if (!/\.(get|post|put|patch|delete|fetch)\s*(<[^>]*>)?\(/.test(src)) {
      continue;
    }
    const rel = relative(root, entry.path);
    const { out, hits, manual: m } = rewriteSource(src, rel);
    rewritten.push(...hits);
    manual.push(...m);
    if (out !== src) {
      changed.add(rel);
      if (!opts.dryRun) await Deno.writeTextFile(entry.path, out);
    }
  }
  return { rewritten, manual, filesChanged: changed.size };
}

/** The CLI's presentation of the report. */
export function printWireReport(r: WireReport, dryRun: boolean): void {
  const verb = dryRun ? "would rewrite" : "rewrote";
  if (r.rewritten.length === 0 && r.manual.length === 0) {
    console.log(
      "sprig migrate wire-paths: nothing to do — every call already uses a wire path.",
    );
    return;
  }
  if (r.rewritten.length) {
    console.log(
      `sprig migrate wire-paths: ${verb} ${r.rewritten.length} call site(s) in ${r.filesChanged} file(s):\n`,
    );
    for (const h of r.rewritten) {
      console.log(`  ${h.file}:${h.line}  ${h.before} → ${h.after}`);
    }
  }
  if (r.manual.length) {
    console.log(
      `\n  ${r.manual.length} call site(s) have a path this codemod cannot resolve — a template\n` +
        `  literal, a variable, or a computed path. Read each one: if it addresses a\n` +
        `  backend route it needs the /api prefix too.\n`,
    );
    for (const m of r.manual) console.log(`  ${m.file}:${m.line}  ${m.text}`);
  }
  if (dryRun) console.log("\n  (--dry-run: nothing was written)");
}
