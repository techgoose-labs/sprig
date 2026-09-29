/**
 * A small TypeScript token scanner shared by the source lints. The wiring lint
 * reads logic.ts syntactically with regexes; these lints need a little more
 * (operands either side of an operator, balanced brackets, which function a
 * token sits in), so they tokenize — comments dropped, strings / template
 * literals / regex literals kept whole — and reason over the token stream.
 * No dependency: `npm:typescript` is not in the lock, and a token stream is
 * enough for every rule the lints enforce.
 */
import { walk } from "@std/fs/walk";
import { join, relative } from "@std/path";
import type { LintResult } from "./lint-types.ts";

export type TokKind = "id" | "num" | "str" | "tmpl" | "regex" | "punct";

export type Tok = {
  kind: TokKind;
  value: string;
  line: number;
  col: number;
  /** offset into the source */
  pos: number;
};

const PUNCT = [
  ">>>=",
  "...",
  "===",
  "!==",
  "**=",
  "<<=",
  ">>=",
  ">>>",
  "&&=",
  "||=",
  "??=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "**",
  "<<",
  ">>",
];

/** Keywords after which a `/` starts a regex literal, not a division. */
const REGEX_AFTER_KEYWORD = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdPart = (c: string) => /[\w$]/.test(c);

/** Tokenize TypeScript source. Comments are dropped; lines/cols are 1-based. */
export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0, line = 1, lineStart = 0;
  const push = (kind: TokKind, start: number, sLine: number, sCol: number) =>
    out.push({
      kind,
      value: src.slice(start, i),
      line: sLine,
      col: sCol,
      pos: start,
    });
  const advanceOver = (to: number) => {
    for (; i < to; i++) {
      if (src[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
    }
  };
  const regexAllowed = () => {
    const p = out[out.length - 1];
    if (!p) return true;
    if (
      p.kind === "num" || p.kind === "str" || p.kind === "tmpl" ||
      p.kind === "regex"
    ) {
      return false;
    }
    if (p.kind === "id") return REGEX_AFTER_KEYWORD.has(p.value);
    return !(p.value === ")" || p.value === "]" || p.value === "}");
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      lineStart = i;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const sLine = line, sCol = i - lineStart + 1, start = i;
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      advanceOver(end < 0 ? src.length : end + 2);
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== "\n") {
        i += src[i] === "\\" ? 2 : 1;
      }
      i++;
      push("str", start, sLine, sCol);
      continue;
    }
    if (c === "`") {
      i++;
      let depth = 0;
      while (i < src.length) {
        const d = src[i];
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === "\n") {
          line++;
          lineStart = i + 1;
        }
        if (depth === 0 && d === "`") break;
        if (d === "$" && src[i + 1] === "{") {
          depth++;
          i += 2;
          continue;
        }
        if (depth > 0 && d === "{") depth++;
        if (depth > 0 && d === "}") depth--;
        i++;
      }
      i++;
      push("tmpl", start, sLine, sCol);
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      while (i < src.length && /[\w.]/.test(src[i])) i++;
      push("num", start, sLine, sCol);
      continue;
    }
    if (isIdStart(c) || c === "#") {
      i++;
      while (i < src.length && isIdPart(src[i])) i++;
      push("id", start, sLine, sCol);
      continue;
    }
    if (c === "/" && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < src.length && src[i] !== "\n") {
        const d = src[i];
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        i++;
      }
      i++;
      while (i < src.length && /[a-z]/.test(src[i])) i++;
      push("regex", start, sLine, sCol);
      continue;
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    i += p ? p.length : 1;
    push("punct", start, sLine, sCol);
  }
  return out;
}

/** Index of the bracket matching the one at `i` (forward for openers, backward for closers). */
export function matchBracket(toks: Tok[], i: number): number {
  const pairs: Record<string, [string, number]> = {
    "(": [")", 1],
    "[": ["]", 1],
    "{": ["}", 1],
    ")": ["(", -1],
    "]": ["[", -1],
    "}": ["{", -1],
  };
  const open = toks[i].value;
  const [close, dir] = pairs[open];
  let depth = 0;
  for (let j = i; j >= 0 && j < toks.length; j += dir) {
    if (toks[j].kind !== "punct") continue;
    if (toks[j].value === open) depth++;
    else if (toks[j].value === close && --depth === 0) return j;
  }
  return -1;
}

export const isP = (t: Tok | undefined, v: string) =>
  !!t && t.kind === "punct" && t.value === v;

/** A `// <tag>: <reason>` suppression, keyed by the 1-based line it covers:
 *  the comment's own line and the line directly below it. */
export function suppressions(src: string, tag: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = new RegExp(`//\\s*${tag}:\\s*(\\S.*?)\\s*$`);
  src.split("\n").forEach((text, idx) => {
    const m = text.match(re);
    if (!m) return;
    out.set(idx + 1, m[1]);
    if (!out.has(idx + 2)) out.set(idx + 2, m[1]);
  });
  return out;
}

/** Every non-test `.ts` file under `root` for which `keep(relPath)` is true,
 *  sorted, as paths relative to `root`. */
export async function tsFiles(
  root: string,
  keep: (rel: string) => boolean,
): Promise<string[]> {
  const out: string[] = [];
  for await (
    const e of walk(root, {
      includeDirs: false,
      exts: [".ts"],
      skip: [/node_modules/, /[\\/]\.[^\\/]+/, /[\\/]dist[\\/]/],
    })
  ) {
    const rel = relative(root, e.path).replaceAll("\\", "/");
    if (/\.test\.ts$/.test(rel) || rel.endsWith(".d.ts")) continue;
    if (keep(rel)) out.push(rel);
  }
  return out.sort();
}

export async function isDir(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).isDirectory;
  } catch {
    return false;
  }
}

/** Split raw findings into kept and suppressed, one source file at a time;
 *  a suppressed line is listed once however many findings it silenced. */
export function applySuppressions(
  result: LintResult,
  file: string,
  raw: LintResult["findings"],
  supp: Map<number, string>,
): void {
  const seen = new Set<number>();
  for (const f of raw) {
    const reason = supp.get(f.line);
    if (reason === undefined) result.findings.push(f);
    else if (!seen.has(f.line)) {
      seen.add(f.line);
      result.suppressed.push({ file, line: f.line, reason });
    }
  }
}

export { join };
