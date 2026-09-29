/**
 * logic-placement (REQ-023) — the logic of the app stays in the backend. Over
 * every island `logic.ts` and page `resolve.ts` under the ui source, flags:
 *   (a) arithmetic on data: `+ - * / % **` (and compound assignments) where both
 *       operands are identifiers/member expressions, or one is a member
 *       expression and the other a numeric literal other than 0 or 1;
 *   (b) domain branching: a data-vs-data RELATIONAL comparison (< > <= >=) in
 *       if / while / ternary / && / || — equality is identity/selection, allowed;
 *   (c) validation beyond required/type: `.test(`, `.match(`, `RegExp`, or a
 *       `.length` compared to a numeric literal > 1 inside an event handler;
 *   (d) calling or defining a validate/compute/calculate/derive/total/price/
 *       discount/tax/eligib/score/rank/allocate/schedule function.
 * UI geometry (event/e/window/document/el/this.el/rect/Math/Date roots, names
 * ending in Width|Height|Top|Left|X|Y|Index|Count|Length|Offset|Scroll) is exempt
 * from (a) and (b). `// sprig-logic: <reason>` suppresses a line.
 */
import { join } from "@std/path";
import { declaredSignals } from "../wiring-lint.ts";
import type { Finding, LintResult } from "./lint-types.ts";
import {
  applySuppressions,
  isDir,
  isP,
  matchBracket,
  suppressions,
  type Tok,
  tokenize,
  tsFiles,
} from "./ts-scan.ts";

const QUERY = "this is a query the backend should answer";
const VALIDATE =
  "validate in the backend; the client checks required/type only";
const HINT_QUERY =
  "move it behind a query in the contract and bind the answer as data; " +
  "`// sprig-logic: <reason>` if it is truly presentation";
const HINT_VALIDATE =
  "send the raw value to the command and render the backend's validation errors; " +
  "`// sprig-logic: <reason>` if it is truly presentation";

const ARITH = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "**",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
]);
const MULT = new Set(["*", "/", "%", "**"]);
const COMPARE = new Set(["==", "===", "!=", "!==", "<", ">", "<=", ">="]);
const RELATIONAL = new Set(["<", ">", "<=", ">="]);
const BRANCH_JOIN = new Set(["&&", "||", "?", "!"]);
const LITERAL_WORDS = new Set([
  "null",
  "undefined",
  "true",
  "false",
  "NaN",
  "Infinity",
]);
const KEYWORDS = new Set([
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
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "with",
  "function",
  "const",
  "let",
  "var",
  "async",
  "import",
  "export",
  "from",
  "as",
  "class",
  "extends",
  "super",
  "default",
  "break",
  "continue",
  "try",
  "finally",
  "type",
  "interface",
  "keyof",
]);
const GEOMETRY_ROOTS = new Set([
  "event",
  "e",
  "window",
  "document",
  "el",
  "rect",
  "Math",
  "Date",
]);
const GEOMETRY_NAME =
  /^(?:width|height|top|left|x|y|index|count|length|offset|scroll)$|(?:Width|Height|Top|Left|X|Y|Index|Count|Length|Offset|Scroll)$/;
const DOMAIN_FN =
  /^(validate|compute|calculate|derive|total|price|discount|tax|eligib|score|rank|allocate|schedule)/i;
const LIFECYCLE = new Set([
  "onBrowserInit",
  "onBrowserDestroy",
  "onServerInit",
  "onInit",
  "onDestroy",
]);
const EVENT_PARAMS = new Set(["event", "e", "ev", "evt"]);
const NOT_FN_HEAD = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "with",
  "function",
]);

/** An operand either side of an operator. */
type Operand = {
  kind: "ident" | "member" | "num" | "lit" | "other";
  start: number;
  end: number;
  names: string[];
  value?: number;
};

const other = (i: number): Operand => ({
  kind: "other",
  start: i,
  end: i,
  names: [],
});

function literalOperand(t: Tok, i: number): Operand | null {
  if (t.kind === "num") {
    return {
      kind: "num",
      start: i,
      end: i,
      names: [],
      value: Number(t.value.replaceAll("_", "")),
    };
  }
  if (t.kind === "str" || t.kind === "tmpl" || t.kind === "regex") {
    return { kind: "lit", start: i, end: i, names: [] };
  }
  if (t.kind === "id" && LITERAL_WORDS.has(t.value)) {
    return { kind: "lit", start: i, end: i, names: [] };
  }
  return null;
}

/** The operand ending at token `j` (walking backwards). */
function operandBack(toks: Tok[], j: number): Operand {
  const t = toks[j];
  if (!t) return other(j);
  const lit = literalOperand(t, j);
  if (lit) return lit;
  const names: string[] = [];
  let member = false;
  let k = j;
  while (k >= 0) {
    const c = toks[k];
    if (isP(c, ")")) {
      const o = matchBracket(toks, k);
      if (o !== k - 1) return other(j);
      k = o - 1;
      continue;
    }
    if (isP(c, "]")) {
      const o = matchBracket(toks, k);
      if (o < 0) return other(j);
      member = true;
      k = o - 1;
      continue;
    }
    if (c.kind === "id" && (c.value === "this" || !KEYWORDS.has(c.value))) {
      names.unshift(c.value);
      if (isP(toks[k - 1], ".") || isP(toks[k - 1], "?.")) {
        member = true;
        k -= 2;
        continue;
      }
      if (names.length === 1 && names[0] === "this") return other(j);
      return { kind: member ? "member" : "ident", start: k, end: j, names };
    }
    return other(j);
  }
  return other(j);
}

/** The operand starting at token `i` (walking forwards). */
function operandFwd(toks: Tok[], i: number): Operand {
  const t = toks[i];
  if (!t) return other(i);
  if (isP(t, "-") && toks[i + 1]?.kind === "num") {
    return {
      kind: "num",
      start: i,
      end: i + 1,
      names: [],
      value: -Number(toks[i + 1].value),
    };
  }
  const lit = literalOperand(t, i);
  if (lit) return lit;
  if (t.kind !== "id" || (KEYWORDS.has(t.value) && t.value !== "this")) {
    return other(i);
  }
  const names = [t.value];
  let member = false;
  let k = i + 1;
  for (;;) {
    const c = toks[k];
    if ((isP(c, ".") || isP(c, "?.")) && toks[k + 1]?.kind === "id") {
      names.push(toks[k + 1].value);
      member = true;
      k += 2;
    } else if (isP(c, "[")) {
      const close = matchBracket(toks, k);
      if (close < 0) return other(i);
      member = true;
      k = close + 1;
    } else if (isP(c, "(")) {
      if (!isP(toks[k + 1], ")")) return other(i);
      k += 2;
    } else if (isP(c, "!")) {
      k++;
    } else break;
  }
  if (names.length === 1 && names[0] === "this") return other(i);
  return { kind: member ? "member" : "ident", start: i, end: k - 1, names };
}

const isData = (o: Operand) => o.kind === "ident" || o.kind === "member";

function isGeometry(o: Operand): boolean {
  if (!isData(o)) return false;
  const [root, second] = o.names;
  if (GEOMETRY_ROOTS.has(root) || (root === "this" && second === "el")) {
    return true;
  }
  return GEOMETRY_NAME.test(o.names[o.names.length - 1]);
}

/** A named constant (`MAX_MODE`, `Tab.Orders`) compares like a literal. */
function isConstant(o: Operand, toks: Tok[]): boolean {
  if (!isData(o)) return false;
  const hasCall = toks.slice(o.start, o.end + 1).some((t) => isP(t, "("));
  if (hasCall) return false;
  if (o.names.length === 1) return /^[A-Z][A-Z0-9_]+$/.test(o.names[0]);
  return /^[A-Z]/.test(o.names[0]);
}

/** Token indices covered by TS generic argument lists (`signal<T[]>(…)`). */
function genericSpans(toks: Tok[]): Set<number> {
  const out = new Set<number>();
  const allowed = new Set([
    ".",
    ",",
    "[",
    "]",
    "|",
    "&",
    ":",
    "?",
    "(",
    ")",
    "=>",
    "<",
    ">",
    ">>",
    "{",
    "}",
    ";",
  ]);
  const follow = new Set([
    "(",
    ")",
    ",",
    ";",
    "=",
    ">",
    ">>",
    "]",
    "[",
    "{",
    "|",
    "&",
    ".",
  ]);
  for (let i = 1; i < toks.length; i++) {
    if (!isP(toks[i], "<") || toks[i - 1].kind !== "id") continue;
    let depth = 0, paren = 0, brace = 0, end = -1;
    for (let j = i; j < toks.length && j < i + 200; j++) {
      const t = toks[j];
      if (t.kind === "punct") {
        if (!allowed.has(t.value)) break;
        if (t.value === "<") depth++;
        else if (t.value === ">") depth--;
        else if (t.value === ">>") depth -= 2;
        else if (t.value === "(") paren++;
        else if (t.value === ")" && --paren < 0) break;
        else if (t.value === "{") brace++;
        else if (t.value === "}" && --brace < 0) break;
        else if (t.value === ";" && brace === 0) break;
        if (depth <= 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) continue;
    const next = toks[end + 1];
    if (next && next.kind === "punct" && follow.has(next.value)) {
      for (let j = i; j <= end; j++) out.add(j);
    }
  }
  return out;
}

/** A function body or expression-bodied arrow: its token range and whether it
 *  is an event handler. */
type Fn = { from: number; to: number; handler: boolean };

function paramNames(toks: Tok[], open: number, close: number): string[] {
  const out: string[] = [];
  for (let j = open + 1; j < close; j++) {
    if (
      toks[j].kind === "id" && (isP(toks[j - 1], "(") || isP(toks[j - 1], ","))
    ) out.push(toks[j].value);
  }
  return out;
}

/** The name an arrow / function expression starting at `s` is assigned to. */
function assignedName(toks: Tok[], s: number): string | null {
  let k = s - 1;
  if (toks[k]?.value === "async") k--;
  if ((isP(toks[k], "=") || isP(toks[k], ":")) && toks[k - 1]?.kind === "id") {
    return toks[k - 1].value;
  }
  return null;
}

/** The callee of the call whose argument list contains token `s`, if any. */
function enclosingCallee(toks: Tok[], s: number): string | null {
  let depth = 0;
  for (let k = s - 1; k >= 0; k--) {
    const t = toks[k];
    if (t.kind !== "punct") continue;
    if (t.value === ")" || t.value === "]" || t.value === "}") depth++;
    else if (t.value === "(" || t.value === "[" || t.value === "{") {
      if (depth === 0) {
        return t.value === "(" && toks[k - 1]?.kind === "id"
          ? toks[k - 1].value
          : null;
      }
      depth--;
    }
  }
  return null;
}

function functions(toks: Tok[], handlers: Set<string>): Fn[] {
  const out: Fn[] = [];
  const isHandler = (
    name: string | null,
    params: string[],
    callee: string | null,
  ) =>
    (!!name &&
      (handlers.has(name) ||
        (/^(on|handle)[A-Z]/.test(name) && !LIFECYCLE.has(name)))) ||
    params.some((p) => EVENT_PARAMS.has(p)) || callee === "addEventListener";
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (isP(t, "=>")) {
      let params: string[] = [];
      let head = i - 1;
      if (isP(toks[head], ")")) {
        head = matchBracket(toks, head);
        params = paramNames(toks, head, i - 1);
      } else if (toks[head]?.kind === "id") params = [toks[head].value];
      else continue;
      const name = assignedName(toks, head);
      const callee = enclosingCallee(toks, head);
      let to: number;
      if (isP(toks[i + 1], "{")) to = matchBracket(toks, i + 1);
      else {
        let depth = 0;
        to = toks.length - 1;
        for (let j = i + 1; j < toks.length; j++) {
          const v = toks[j].kind === "punct" ? toks[j].value : "";
          if (v === "(" || v === "[" || v === "{") depth++;
          else if (v === ")" || v === "]" || v === "}") {
            if (depth-- === 0) {
              to = j - 1;
              break;
            }
          } else if ((v === "," || v === ";") && depth === 0) {
            to = j - 1;
            break;
          }
        }
      }
      out.push({ from: i + 1, to, handler: isHandler(name, params, callee) });
      continue;
    }
    if (!isP(t, "{")) continue;
    let close = i - 1;
    if (!isP(toks[close], ")")) {
      let k = i - 1;
      while (
        k > 0 && !isP(toks[k], ")") &&
        (toks[k].kind === "id" ||
          [".", "<", ">", "[", "]", "|", ",", "&"].includes(toks[k].value))
      ) k--;
      if (!(isP(toks[k], ":") && isP(toks[k - 1], ")"))) continue;
      close = k - 1;
    }
    const open = matchBracket(toks, close);
    if (open < 1) continue;
    const head = toks[open - 1];
    let name: string | null = null;
    if (head.kind === "id") {
      if (NOT_FN_HEAD.has(head.value)) {
        if (head.value !== "function") continue;
        name = assignedName(toks, open - 1);
      } else name = head.value;
    } else continue;
    out.push({
      from: i,
      to: matchBracket(toks, i),
      handler: isHandler(
        name,
        paramNames(toks, open, close),
        enclosingCallee(toks, open - 1),
      ),
    });
  }
  return out;
}

/** Function names this file defines (so zero-arg calls to them count as calls). */
function definitionAt(toks: Tok[], k: number): boolean {
  const t = toks[k];
  const prev = toks[k - 1];
  if (prev?.value === "function") return true;
  const next = toks[k + 1];
  if (isP(next, "(") && !isP(prev, ".") && !isP(prev, "?.")) {
    const close = matchBracket(toks, k + 1);
    const after = toks[close + 1];
    if (isP(after, "{")) return true;
    if (isP(after, ":")) {
      let j = close + 2;
      while (
        j < toks.length && !isP(toks[j], "{") && !isP(toks[j], ";") &&
        !isP(toks[j], "=>")
      ) j++;
      return isP(toks[j], "{");
    }
    return false;
  }
  if (!(isP(next, "=") || isP(next, ":")) || t.kind !== "id") return false;
  let j = k + 2;
  if (toks[j]?.value === "async") j++;
  const v = toks[j];
  if (!v) return false;
  if (v.value === "function" || v.value === "computed") return true;
  if (isP(v, "(")) {
    const close = matchBracket(toks, j);
    return isP(toks[close + 1], "=>") || isP(toks[close + 1], ":");
  }
  return v.kind === "id" && isP(toks[j + 1], "=>");
}

/** Logic-placement findings for one source file, suppressions applied.
 *  `handlers` names the functions its template binds to (event) handlers. */
export function checkLogicSource(
  src: string,
  file: string,
  opts: { handlers?: Iterable<string> } = {},
): Pick<LintResult, "findings" | "suppressed"> {
  const toks = tokenize(src);
  const generic = genericSpans(toks);
  const fns = functions(toks, new Set(opts.handlers ?? []));
  const inHandler = (i: number) =>
    fns.some((f) => f.handler && i >= f.from && i <= f.to);
  const signals = declaredSignals(src);
  const text = (a: number, b: number) =>
    src.slice(toks[a].pos, toks[b].pos + toks[b].value.length);
  const raw: Finding[] = [];
  const add = (
    at: Tok,
    letter: string,
    what: string,
    tail: string,
    hint: string,
  ) =>
    raw.push({
      rule: `logic-placement/${letter}`,
      file,
      line: at.line,
      col: at.col,
      message: `(${letter}) ${what} — ${tail}`,
      hint,
      severity: "error",
    });
  const defined = new Set<string>();
  for (let k = 0; k < toks.length; k++) {
    if (
      toks[k].kind === "id" && DOMAIN_FN.test(toks[k].value) &&
      definitionAt(toks, k)
    ) defined.add(toks[k].value);
  }

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (generic.has(k)) continue;

    if (t.kind === "punct" && ARITH.has(t.value)) {
      let L = operandBack(toks, k - 1);
      let R = operandFwd(toks, k + 1);
      if (!MULT.has(t.value) && !t.value.endsWith("=")) {
        if (MULT.has(toks[L.start - 1]?.value ?? "")) L = other(L.start);
        if (MULT.has(toks[R.end + 1]?.value ?? "")) R = other(R.end);
      }
      if (t.value.endsWith("=") && MULT.has(toks[R.end + 1]?.value ?? "")) {
        R = other(R.end);
      }
      if (isGeometry(L) || isGeometry(R)) continue;
      const bothData = isData(L) && isData(R);
      const rate = (m: Operand, n: Operand) =>
        m.kind === "member" && n.kind === "num" && n.value !== 0 &&
        n.value !== 1;
      if (bothData || rate(L, R) || rate(R, L)) {
        add(
          toks[L.start],
          "a",
          `arithmetic on data \`${text(L.start, R.end)}\``,
          QUERY,
          HINT_QUERY,
        );
      }
      continue;
    }

    if (t.kind === "punct" && COMPARE.has(t.value)) {
      let L = operandBack(toks, k - 1);
      let R = operandFwd(toks, k + 1);
      if (ARITH.has(toks[L.start - 1]?.value ?? "")) L = other(L.start);
      if (ARITH.has(toks[R.end + 1]?.value ?? "")) R = other(R.end);
      const leaf = (o: Operand) => o.names[o.names.length - 1];
      const len = [L, R].find((o) => isData(o) && leaf(o) === "length");
      if (len) {
        const n = len === L ? R : L;
        if (n.kind === "num" && (n.value ?? 0) > 1 && inHandler(k)) {
          add(
            toks[L.start],
            "c",
            `\`${text(L.start, R.end)}\` checks a length in an event handler`,
            VALIDATE,
            HINT_VALIDATE,
          );
        }
        continue;
      }
      if (!RELATIONAL.has(t.value)) continue;
      if (!isData(L) || !isData(R) || isGeometry(L) || isGeometry(R)) continue;
      if (isConstant(L, toks) || isConstant(R, toks)) continue;
      if (branching(toks, L.start, R.end)) {
        add(
          toks[L.start],
          "b",
          `data-vs-data branch \`${text(L.start, R.end)}\``,
          QUERY,
          HINT_QUERY,
        );
      }
      continue;
    }

    if (t.kind !== "id") continue;
    const prev = toks[k - 1];
    const member = isP(prev, ".") || isP(prev, "?.");

    if (
      member && (t.value === "test" || t.value === "match") &&
      isP(toks[k + 1], "(")
    ) {
      add(
        t,
        "c",
        `\`.${t.value}(\` pattern validation`,
        VALIDATE,
        HINT_VALIDATE,
      );
      continue;
    }
    if (!member && t.value === "RegExp") {
      add(t, "c", "`RegExp` pattern validation", VALIDATE, HINT_VALIDATE);
      continue;
    }

    if (t.value === "computed" || !DOMAIN_FN.test(t.value)) continue;
    if (definitionAt(toks, k)) {
      add(t, "d", `defines \`${t.value}\``, QUERY, HINT_QUERY);
      continue;
    }
    let open = k + 1;
    if (isP(toks[open], "<") && generic.has(open)) {
      while (generic.has(open)) open++;
    }
    if (!isP(toks[open], "(")) continue;
    if (prev?.value === "import" || prev?.value === "function") continue;
    const hasArgs = !isP(toks[open + 1], ")");
    const bareRead = !member && signals.has(t.value);
    if (hasArgs || defined.has(t.value) || (!member && !bareRead)) {
      add(t, "d", `calls \`${t.value}(…)\``, QUERY, HINT_QUERY);
    }
  }
  const out: LintResult = { findings: [], suppressed: [], checked: [] };
  applySuppressions(out, file, raw, suppressions(src, "sprig-logic"));
  return out;
}

/** Is the comparison spanning tokens [a, b] a branch condition? */
function branching(toks: Tok[], a: number, b: number): boolean {
  for (;;) {
    const before = toks[a - 1], after = toks[b + 1];
    if (before?.kind === "punct" && BRANCH_JOIN.has(before.value)) return true;
    if (
      after?.kind === "punct" &&
      (after.value === "?" || after.value === "&&" || after.value === "||")
    ) return true;
    if (isP(before, "(") && isP(after, ")")) {
      if (["if", "while"].includes(toks[a - 2]?.value)) return true;
      a -= 1;
      b += 1;
      continue;
    }
    return false;
  }
}

/** The handler names a component's template binds: `(event)="name(…)"`. */
export function templateHandlers(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/\(([\w.:-]+)\)\s*=\s*"([^"]*)"/g)) {
    for (const c of m[2].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) out.add(c[1]);
  }
  return out;
}

/** Run logic-placement over every island `logic.ts` and page `resolve.ts`. */
export async function lintLogicPlacement(
  opts: { uiSrc: string },
): Promise<LintResult> {
  const result: LintResult = { findings: [], suppressed: [], checked: [] };
  if (!(await isDir(opts.uiSrc))) {
    result.skipped = `no ui source at ${opts.uiSrc}`;
    return result;
  }
  const scoped = await tsFiles(
    opts.uiSrc,
    (rel) => /(^|\/)(logic|resolve)\.ts$/.test(rel),
  );
  if (!scoped.length) {
    result.skipped =
      `no island logic.ts or page resolve.ts under ${opts.uiSrc}`;
    return result;
  }
  for (const rel of scoped) {
    const file = join(opts.uiSrc, rel);
    const src = await Deno.readTextFile(file);
    let handlers = new Set<string>();
    if (rel === "logic.ts" || rel.endsWith("/logic.ts")) {
      try {
        handlers = templateHandlers(
          await Deno.readTextFile(join(file, "..", "template.html")),
        );
      } catch {
        handlers = new Set();
      }
    }
    const r = checkLogicSource(src, file, { handlers });
    result.checked.push(file);
    result.findings.push(...r.findings);
    result.suppressed.push(...r.suppressed);
  }
  return result;
}
