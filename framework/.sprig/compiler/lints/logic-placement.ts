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
 * UI geometry (event/e/ev/evt/window/document/el/this.el/rect/Math/Date/
 * performance roots, `now`, names ending in Width|Height|Top|Left|X|Y|Index|
 * Count|Length|Offset|Scroll) is exempt from (a) and (b), and a geometry-named
 * definition (`totalHeight`) from (d). `// sprig-logic: <reason>` suppresses a
 * line.
 *
 * REQ-050 (the adversarial corpus, fixtures/lints/logic-corpus-*) adds:
 *   (a) a money-named signal read (`subtotal()`, `amount()` …) × a numeric
 *       literal other than 0 or 1; a member ×/÷ 10|100|1000 inside a
 *       `.format(` argument is a unit conversion for display, not a rate;
 *   (b) a THRESHOLD: a member expression vs a numeric literal other than 0/±1
 *       or an ALL_CAPS constant; the WALL CLOCK: `Date.now()` / `new Date()`
 *       vs anything but a numeric literal; a `.length` vs a data member —
 *       each in a branch condition;
 *   (c) `.exec(` / `.matchAll(` / `.search(`, and a `.length` equal / unequal
 *       to a literal > 1 anywhere (an exact length is a format);
 *   (d) date-rule library calls (`isAfter`, `isBefore`, `isPast`, `isFuture`,
 *       `differenceIn…`, `add…`/`sub…` Days/Weeks/Months/Years/Hours/Minutes/
 *       BusinessDays);
 *   (e) ACCESS decided in the client: a `role`/`roles`/`permission(s)`/`plan`/
 *       `tier`/`entitlement(s)` compared, switched on, used as a lookup key or
 *       tested with `.includes(`/`.has(`; a `switch` whose cases set
 *       `can…`/`may…` flags;
 *   (f) a client RETRY loop: a `while`/`for`/`do` whose body `try`s an
 *       `await` and catches — retries and idempotency are the server's.
 * Template-literal interpolations (`${…}`) are scanned like code.
 *
 * REQ-050 AMENDMENT: a parenthesised group is an operand (see `group`); (e)
 * also fires on a `switch` / `if` chain on a record's `status|state|stage|
 * phase` deciding data in ≥2 branches; every `template.html` under the ui
 * source is scanned too (see `checkTemplateLogic`).
 *
 * REQ-065 (a breakdown→build run on fixtures/kennel-app):
 *   (d) a DEFINITION is flagged only when its body does work — arithmetic, a
 *       comparison, a branch/loop, a computed lookup, or a call with arguments
 *       other than a formatter (`doesWork`); `total() { return
 *       this.day()?.total ?? this.seed() }` is an accessor, whatever its name;
 *   (c) a regex whose subject is the current URL (`location`, `pathname`,
 *       `href`, `hash`, a route) or whose pattern is a route (`DOG_ROUTE`) is
 *       presentation routing, not validation;
 *   (e) a module STATUS TABLE (`Record<XStatus, …>` / `Record<…, XStatus>`, or
 *       an object / Map whose keys or values are all a lifecycle union's
 *       values): a status-valued read compared (`status() === OFFERED_FROM[c]`)
 *       or a lookup keyed by a lifecycle field whose values are not all
 *       strings (`ACTIONS[order().status]`) is a client state machine; a
 *       status → label/class table passes.
 */
import { join } from "@std/path";
import { declaredSignals } from "../wiring-lint.ts";
import { parseTemplate } from "../parse.ts";
import type { Node } from "../node.ts";
import { collectUiFiles } from "./ui-files.ts";
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
const ACCESS = "access is the backend's call: bind a `can…` flag it answers";
const RETRY =
  "retry and idempotency are the server's: send once with an idempotency key";
const HINT_ACCESS =
  "have the query return the permission (`canRefund: true`) and bind it; " +
  "`// sprig-logic: <reason>` if it is truly presentation";
const HINT_RETRY =
  "call the command once through `optimistic(…)` and render its failure; " +
  "`// sprig-logic: <reason>` if it is truly presentation";
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
  "$event",
  "event",
  "e",
  "ev",
  "evt",
  "performance",
  "window",
  "document",
  "el",
  "rect",
  "Math",
  "Date",
]);
const GEOMETRY_NAME =
  /^(?:width|height|top|left|x|y|index|count|length|offset|scroll|now)$|(?:Width|Height|Top|Left|X|Y|Index|Count|Length|Offset|Scroll)$/;
const DOMAIN_FN =
  /^(validate|compute|calculate|derive|total|price|discount|tax|eligib|score|rank|allocate|schedule)/i;
/** REQ-050 (d): date-library calls that decide deadlines ("overdue", "due"). */
const DATE_FN =
  /^(isAfter|isBefore|isPast|isFuture|differenceIn[A-Z]\w*|(add|sub)(Days|Weeks|Months|Years|Hours|Minutes|BusinessDays))$/;
/** REQ-050 (a): a signal read with a money name × a literal is a rate. */
const MONEY_NAME =
  /(amount|balance|cost|fee|price|total|revenue|cents|tax|salary|discount)/i;
/** REQ-050 (a): a formatter's argument — ×/÷ a power of ten there is units. */
const FORMAT_CALLS = new Set(["format", "formatToParts", "formatRange"]);
const POW10 = new Set([10, 100, 1000]);
/** REQ-050 (e): names that carry access / entitlement. */
const ACCESS_NAME =
  /^(role|roles|permission|permissions|plan|tier|entitlement|entitlements)$/;
const ACCESS_FLAG = /^(can|may)[A-Z]\w*$/;
/** REQ-050 AMENDMENT (e): a record's lifecycle field. */
const LIFECYCLE_FIELD = /^(status|state|stage|phase)$/;
const MEMBERSHIP = new Set(["includes", "has", "indexOf"]);
const REGEX_CALLS = new Set(["test", "match", "exec", "matchAll", "search"]);
const EQUALITY = new Set(["==", "===", "!=", "!=="]);
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
  /** a parenthesised group whose reads include UI geometry */
  geo?: boolean;
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
      if (o !== k - 1) {
        return k === j && isGroupOpen(toks, o) ? group(toks, o, k) : other(j);
      }
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
  if (isP(t, "(") && isGroupOpen(toks, i)) {
    const close = matchBracket(toks, i);
    return close < 0 ? other(i) : group(toks, i, close);
  }
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

/** Is the `(` at `o` a grouping paren (not a call's argument list)? */
function isGroupOpen(toks: Tok[], o: number): boolean {
  const b = toks[o - 1];
  if (!b) return true;
  if (b.kind === "id") return KEYWORDS.has(b.value) && b.value !== "this";
  return !(isP(b, ")") || isP(b, "]") || b.kind === "tmpl");
}

/** REQ-050 AMENDMENT: a parenthesised group `( … )` is an operand: geometry
 *  when any read in it is geometry; a member operand when it reads a member
 *  (`(1 - this.promoRate)`); an identifier operand when it reads only plain
 *  identifiers / signal reads (`(1 - rate())` — data × data, but never a rate
 *  against a literal: `(zoom() - 0.1) * 100`); not an operand when it holds a
 *  string (`(base() ?? "") + path()` is concatenation) or reads nothing, or
 *  when it reads no member and holds or feeds a `%` — index wrap-around
 *  `(active() + 1) % n` and the template floor idiom `(n - (n % 60)) / 60`. */
function group(toks: Tok[], open: number, close: number): Operand {
  let member = false, read = false, geo = false;
  for (let j = open + 1; j < close; j++) {
    const t = toks[j];
    if (t.kind === "str" || t.kind === "tmpl") return other(open);
    if (t.kind !== "id" || isP(toks[j - 1], ".") || isP(toks[j - 1], "?.")) {
      continue;
    }
    const o = operandFwd(toks, j);
    if (!isData(o)) continue;
    if (isGeometry(o)) geo = true;
    if (o.kind === "member") member = true;
    read = true;
    j = Math.max(j, o.end);
  }
  if (!read) return other(open);
  const mod = isP(toks[close + 1], "%") || isP(toks[open - 1], "%") ||
    toks.slice(open + 1, close).some((t) => isP(t, "%"));
  if (!member && !geo && mod) return other(open);
  return {
    kind: member || geo ? "member" : "ident",
    start: open,
    end: close,
    names: ["(…)"],
    geo,
  };
}

function isGeometry(o: Operand): boolean {
  if (!isData(o)) return false;
  if (o.geo) return true;
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

/** An `ALL_CAPS` identifier (a named threshold like `MAX_PER_ORDER`). */
function isAllCaps(o: Operand, toks: Tok[]): boolean {
  return o.kind === "ident" && o.names.length === 1 &&
    /^[A-Z][A-Z0-9_]+$/.test(o.names[0]) &&
    !toks.slice(o.start, o.end + 1).some((t) => isP(t, "("));
}

/** A zero-argument call read (`subtotal()`), not a bare identifier. */
const isCallRead = (o: Operand, toks: Tok[]) =>
  o.kind === "ident" && toks.slice(o.start, o.end + 1).some((t) => isP(t, "("));

/** `Date.now()` ending at / `new Date()` around an operand: the wall clock. */
function isClockBack(o: Operand, toks: Tok[]): boolean {
  const last = toks[o.end];
  if (!isP(last, ")")) return false;
  if (o.names.length === 2 && o.names[0] === "Date" && o.names[1] === "now") {
    return true;
  }
  return o.names.length === 1 && o.names[0] === "Date" &&
    toks[o.start - 1]?.value === "new";
}
function isClockFwd(toks: Tok[], i: number): boolean {
  if (
    toks[i]?.value === "new" && toks[i + 1]?.value === "Date" &&
    isP(toks[i + 2], "(") && isP(toks[i + 3], ")")
  ) return true;
  return toks[i]?.value === "Date" && isP(toks[i + 1], ".") &&
    toks[i + 2]?.value === "now" && isP(toks[i + 3], "(") &&
    isP(toks[i + 4], ")");
}

/** Line/col of a source offset, from the offsets where lines start. */
function lineColAt(
  starts: number[],
  pos: number,
): { line: number; col: number } {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: pos - starts[lo] + 1 };
}

/** REQ-050: the token stream with every template literal's `${…}`
 *  interpolations spliced in after it as `( … )` groups, positions intact, so
 *  arithmetic and branching inside a template are scanned like code. */
function expandTemplates(
  src: string,
  toks: Tok[],
  starts = [0, ...[...src.matchAll(/\n/g)].map((m) => m.index + 1)],
): Tok[] {
  const out: Tok[] = [];
  for (const t of toks) {
    out.push(t);
    if (t.kind !== "tmpl") continue;
    const v = t.value;
    let i = 1, depth = 0, from = -1;
    while (i < v.length - 1) {
      const d = v[i];
      if (d === "\\") {
        i += 2;
        continue;
      }
      if (depth === 0 && d === "$" && v[i + 1] === "{") {
        depth = 1;
        from = i + 2;
        i += 2;
        continue;
      }
      if (depth > 0 && d === "{") depth++;
      if (depth > 0 && d === "}" && --depth === 0) {
        const base = t.pos + from;
        const inner = tokenize(v.slice(from, i)).map((x) => {
          const lc = lineColAt(starts, base + x.pos);
          return { ...x, pos: base + x.pos, line: lc.line, col: lc.col };
        });
        const mark = (value: string): Tok => ({ ...t, kind: "punct", value });
        out.push(mark("("), ...expandTemplates(src, inner, starts), mark(")"));
      }
      i++;
    }
  }
  return out;
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
  opts: {
    handlers?: Iterable<string>;
    /** only these rule letters (template expressions run "abce") */
    rules?: string;
    /** a relational test of a ternary whose every arm holds a string is a
     *  label, not a branch (template text: `mins < 1 ? 'now' : …`) */
    labels?: boolean;
    /** a class / style / aria binding: no (b) at all */
    presentation?: boolean;
  } = {},
): Pick<LintResult, "findings" | "suppressed"> {
  const toks = expandTemplates(src, tokenize(src));
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
    (!opts.rules || opts.rules.includes(letter)) &&
    !(letter === "b" && labelB) &&
    raw.push({
      rule: `logic-placement/${letter}`,
      file,
      line: at.line,
      col: at.col,
      message: `(${letter}) ${what} — ${tail}`,
      hint,
      severity: "error",
    });
  let labelB = false;
  const defined = new Set<string>();
  // REQ-065: a (d)-named definition whose body only reads or formats a field
  // (`total() { return this.day()?.total ?? this.seed() }`) is an accessor.
  const passthrough = (k: number) => {
    const body = defBody(toks, k);
    return !!body && !doesWork(toks, body[0], body[1]);
  };
  for (let k = 0; k < toks.length; k++) {
    if (
      toks[k].kind === "id" && DOMAIN_FN.test(toks[k].value) &&
      definitionAt(toks, k) && !passthrough(k)
    ) defined.add(toks[k].value);
  }
  const tables = statusTables(toks);

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
      const units = (n: Operand) =>
        (t.value === "/" || t.value === "*") && n.kind === "num" &&
        POW10.has(n.value ?? 0) &&
        (FORMAT_CALLS.has(enclosingCallee(toks, k) ?? "") || piped(toks, k));
      const rate = (m: Operand, n: Operand) =>
        n.kind === "num" && n.value !== 0 && n.value !== 1 && !units(n) &&
        (m.kind === "member" ||
          (isCallRead(m, toks) && MONEY_NAME.test(m.names[0])));
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
      labelB = !!opts.presentation || (!!opts.labels && labelTernary(toks, k));
      let L = operandBack(toks, k - 1);
      let R = operandFwd(toks, k + 1);
      if (ARITH.has(toks[L.start - 1]?.value ?? "")) L = other(L.start);
      if (ARITH.has(toks[R.end + 1]?.value ?? "")) R = other(R.end);
      const leaf = (o: Operand) => o.names[o.names.length - 1];
      const len = [L, R].find((o) => isData(o) && leaf(o) === "length");
      if (len) {
        const n = len === L ? R : L;
        const exact = EQUALITY.has(t.value);
        if (n.kind === "num" && (n.value ?? 0) > 1 && (exact || inHandler(k))) {
          add(
            toks[L.start],
            "c",
            exact
              ? `\`${
                text(L.start, R.end)
              }\` requires an exact length (a format)`
              : `\`${
                text(L.start, R.end)
              }\` checks a length in an event handler`,
            VALIDATE,
            HINT_VALIDATE,
          );
        } else if (
          RELATIONAL.has(t.value) && n.kind === "member" && !isGeometry(n) &&
          !isConstant(n, toks) && branching(toks, L.start, R.end)
        ) {
          add(
            toks[L.start],
            "b",
            `a count checked against a data limit \`${text(L.start, R.end)}\``,
            QUERY,
            HINT_QUERY,
          );
        }
        continue;
      }
      if (!RELATIONAL.has(t.value)) continue;
      const clockL = isData(L) && isClockBack(L, toks);
      const clockR = isClockFwd(toks, k + 1);
      if (clockL || clockR) {
        const from = clockL
          ? L.start - (toks[L.start - 1]?.value === "new" ? 1 : 0)
          : exprStart(toks, k - 1);
        const to = clockR ? clockEnd(toks, k + 1) : exprEnd(toks, k + 1);
        if ((clockL ? R : L).kind !== "num") {
          add(
            toks[from],
            "b",
            `compares data to the wall clock \`${text(from, to)}\``,
            QUERY,
            HINT_QUERY,
          );
        }
        continue;
      }
      const threshold = (m: Operand, n: Operand) =>
        m.kind === "member" && !isGeometry(m) &&
        ((n.kind === "num" && ![0, 1, -1].includes(n.value ?? 0)) ||
          isAllCaps(n, toks));
      if (
        (threshold(L, R) || threshold(R, L)) && branching(toks, L.start, R.end)
      ) {
        add(
          toks[L.start],
          "b",
          `threshold \`${text(L.start, R.end)}\``,
          QUERY,
          HINT_QUERY,
        );
        continue;
      }
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

    if (member && REGEX_CALLS.has(t.value) && isP(toks[k + 1], "(")) {
      if (urlRegex(toks, k)) continue;
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
      if (urlRegExpCtor(toks, k)) continue;
      add(t, "c", "`RegExp` pattern validation", VALIDATE, HINT_VALIDATE);
      continue;
    }

    if (!member && DATE_FN.test(t.value) && isP(toks[k + 1], "(")) {
      if (prev?.value !== "import" && prev?.value !== "function") {
        add(t, "d", `calls the date rule \`${t.value}(…)\``, QUERY, HINT_QUERY);
      }
      continue;
    }
    const table = !member ? tables.get(t.value) : undefined;
    if (table && table.decl !== k) {
      const use = tableUse(toks, k, table);
      if (use) {
        add(
          t,
          "e",
          `the status table \`${t.value}\` ${use}`,
          ACCESS,
          HINT_ACCESS,
        );
        continue;
      }
    }
    if (ACCESS_NAME.test(t.value) && accessUse(toks, k)) {
      add(
        t,
        "e",
        `decides access by \`${t.value}\``,
        ACCESS,
        HINT_ACCESS,
      );
      continue;
    }
    if (t.value === "switch" && isP(toks[k + 1], "(")) {
      const close = matchBracket(toks, k + 1);
      const body = close + 1;
      if (isP(toks[body], "{")) {
        const end = matchBracket(toks, body);
        const flag = toks.slice(body, end).find((x, j) =>
          x.kind === "id" && ACCESS_FLAG.test(x.value) &&
          (isP(toks[body + j + 1], "=") || isP(toks[body + j + 1], ":"))
        );
        if (flag) {
          add(
            t,
            "e",
            `a \`switch\` sets the \`${flag.value}\` permission`,
            ACCESS,
            HINT_ACCESS,
          );
        } else if (lifecycleSubject(toks, k + 2, close - 1)) {
          const arms = caseArms(toks, body, end).filter((a) =>
            producesData(toks, a[0], a[1])
          ).length;
          if (arms >= 2) {
            add(
              t,
              "e",
              `a \`switch\` on \`${
                text(k + 2, close - 1)
              }\` decides data in ${arms} branches`,
              ACCESS,
              HINT_ACCESS,
            );
          }
        }
      }
      continue;
    }
    if (t.value === "if" && prev?.value !== "else" && isP(toks[k + 1], "(")) {
      const chain = ifChain(toks, k);
      const onStatus = chain.filter((b) =>
        b.cond && lifecycleTest(toks, b.cond[0], b.cond[1])
      );
      const arms = chain.filter((b) => producesData(toks, b.body[0], b.body[1]))
        .length;
      if (onStatus.length >= 2 && arms >= 2) {
        add(
          t,
          "e",
          `an \`if\` chain on a lifecycle field decides data in ${arms} branches`,
          ACCESS,
          HINT_ACCESS,
        );
      }
    }
    if (
      (t.value === "while" || t.value === "for" || t.value === "do") &&
      retryLoop(toks, k)
    ) {
      add(t, "f", "retries a server call in a loop", RETRY, HINT_RETRY);
      continue;
    }

    if (t.value === "computed" || !DOMAIN_FN.test(t.value)) continue;
    if (GEOMETRY_NAME.test(t.value)) continue;
    if (definitionAt(toks, k)) {
      if (!passthrough(k)) {
        add(t, "d", `defines \`${t.value}\``, QUERY, HINT_QUERY);
      }
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

/** REQ-065 (d): the body token range [open, close] of the definition whose
 *  name is token `k` — a method / getter / `function` body, an arrow's block or
 *  expression, or a `computed(…)` argument list. */
function defBody(toks: Tok[], k: number): [number, number] | null {
  const block = (j: number): [number, number] | null => {
    const close = matchBracket(toks, j);
    return close < 0 ? null : [j, close];
  };
  const arrowBody = (arrow: number): [number, number] | null => {
    if (isP(toks[arrow + 1], "{")) return block(arrow + 1);
    let depth = 0;
    for (let j = arrow + 1; j < toks.length; j++) {
      const v = toks[j].kind === "punct" ? toks[j].value : "";
      if (v === "(" || v === "[" || v === "{") depth++;
      else if (v === ")" || v === "]" || v === "}") {
        if (depth-- === 0) return [arrow, j - 1];
      } else if ((v === "," || v === ";") && depth === 0) return [arrow, j - 1];
    }
    return [arrow, toks.length - 1];
  };
  const afterParams = (open: number): [number, number] | null => {
    const close = matchBracket(toks, open);
    if (close < 0) return null;
    let j = close + 1;
    if (isP(toks[j], "=>")) return arrowBody(j);
    while (
      j < toks.length && !isP(toks[j], "{") && !isP(toks[j], ";") &&
      !isP(toks[j], "=>")
    ) j++;
    if (isP(toks[j], "=>")) return arrowBody(j);
    return isP(toks[j], "{") ? block(j) : null;
  };
  if (isP(toks[k + 1], "(")) return afterParams(k + 1);
  if (!(isP(toks[k + 1], "=") || isP(toks[k + 1], ":"))) return null;
  let j = k + 2;
  if (toks[j]?.value === "async") j++;
  const v = toks[j];
  if (!v) return null;
  if (v.value === "computed" && isP(toks[j + 1], "(")) return block(j + 1);
  if (v.value === "function") {
    let o = j + 1;
    while (o < toks.length && !isP(toks[o], "(")) o++;
    return afterParams(o);
  }
  if (isP(v, "(")) return afterParams(j);
  if (v.kind === "id" && isP(toks[j + 1], "=>")) return arrowBody(j + 1);
  return null;
}

/** Calls that only format a value for display. */
const FORMATTERS = new Set([
  ...FORMAT_CALLS,
  "toFixed",
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
  "toString",
  "String",
  "Number",
  "Boolean",
]);

/** REQ-065 (d): does the body in tokens (a, b) DO something — arithmetic, a
 *  comparison, a branch or loop, a computed lookup, or a call with arguments
 *  other than a formatter? `??`, `?.`, `||`, `&&` fallbacks and zero-argument
 *  reads are a passthrough. */
function doesWork(toks: Tok[], a: number, b: number): boolean {
  for (let j = a + 1; j < b; j++) {
    const t = toks[j];
    if (t.kind === "punct") {
      if (ARITH.has(t.value) || COMPARE.has(t.value) || t.value === "?") {
        return true;
      }
      if (t.value === "[") {
        const p = toks[j - 1];
        if (p && (p.kind === "id" || isP(p, ")") || isP(p, "]"))) {
          if (!KEYWORDS.has(p.value) || p.value === "this") return true;
        }
      }
      if (t.value === "(" && !isP(toks[j + 1], ")")) {
        const callee = toks[j - 1];
        if (
          callee?.kind === "id" && !KEYWORDS.has(callee.value) &&
          !FORMATTERS.has(callee.value)
        ) return true;
      }
      continue;
    }
    if (
      t.kind === "id" &&
      ["if", "switch", "for", "while", "do", "case"].includes(t.value)
    ) return true;
  }
  return false;
}

/** REQ-065 (c): the current URL / a route — `location`, `pathname`, `href`,
 *  `hash`, a route pattern — read by a regex is presentation routing. */
const URL_NAME =
  /^(location|pathname|href|hash|route|routes|currentRoute)$|(Pathname|Href|Route|ROUTE)$/;
const ROUTE_PATTERN = /route/i;

/** Token ranges' identifier names. */
function namesIn(toks: Tok[], a: number, b: number): string[] {
  const out: string[] = [];
  for (let j = a; j <= b; j++) {
    if (toks[j]?.kind === "id") out.push(toks[j].value);
  }
  return out;
}

/** The first token of the receiver chain ending just before the `.` at `dot`
 *  (`location.pathname`, `new RegExp(…)`, `/re/`). */
function receiverStart(toks: Tok[], dot: number): number {
  let j = dot - 1;
  for (;;) {
    const t = toks[j];
    if (!t) return j + 1;
    if (isP(t, ")") || isP(t, "]")) {
      const o = matchBracket(toks, j);
      if (o < 0) return j + 1;
      j = o - 1;
      if (toks[j]?.kind === "id") continue;
      return o;
    }
    if (t.kind === "id" || t.kind === "regex" || t.kind === "str") {
      if (isP(toks[j - 1], ".") || isP(toks[j - 1], "?.")) {
        j -= 2;
        continue;
      }
      return toks[j - 1]?.value === "new" ? j - 1 : j;
    }
    return j + 1;
  }
}

/** Is the regex call at `k` (`.test(` / `.match(` …) applied to the current
 *  URL or with a route pattern? `.test(x)` / `.exec(x)`: the subject is the
 *  argument; `.match` / `.matchAll` / `.search`: the receiver. */
function urlRegex(toks: Tok[], k: number): boolean {
  const open = k + 1;
  const close = matchBracket(toks, open);
  if (close < 0) return false;
  const recv = receiverStart(toks, k - 1);
  const recvNames = namesIn(toks, recv, k - 2);
  const argNames = namesIn(toks, open + 1, close - 1);
  const subject = toks[k].value === "test" || toks[k].value === "exec"
    ? argNames
    : recvNames;
  if (subject.some((n) => URL_NAME.test(n))) return true;
  const pattern = toks[k].value === "test" || toks[k].value === "exec"
    ? recvNames
    : argNames;
  return pattern.length === 1 && ROUTE_PATTERN.test(pattern[0]);
}

/** Is the `RegExp` at `k` a route pattern — assigned to a route-named binding,
 *  or immediately `.test(` / `.exec(`-ed against the current URL? */
function urlRegExpCtor(toks: Tok[], k: number): boolean {
  let s = k;
  if (toks[s - 1]?.value === "new") s--;
  if (isP(toks[s - 1], "=") && toks[s - 2]?.kind === "id") {
    if (ROUTE_PATTERN.test(toks[s - 2].value)) return true;
  }
  if (!isP(toks[k + 1], "(")) return false;
  const close = matchBracket(toks, k + 1);
  const m = close + 2;
  return close > 0 && isP(toks[close + 1], ".") &&
    (toks[m]?.value === "test" || toks[m]?.value === "exec") &&
    isP(toks[m + 1], "(") && urlRegex(toks, m);
}

/** REQ-065 (e): a module table (`const T: Record<K, V> = { … }` or
 *  `new Map([...])`) whose keys or values are a record's lifecycle values. */
type StatusTable = {
  decl: number;
  keyStatus: boolean;
  valueStatus: boolean;
  /** every value is a string literal: a label / class table */
  labels: boolean;
};

const LIFECYCLE_TYPE = /(Status|State|Stage|Phase)$/;

/** Every lifecycle union in the file: `type XStatus = "a" | "b"`, and the
 *  literal unions of `status|state|stage|phase` fields. Values, unquoted. */
function lifecycleValues(
  toks: Tok[],
): { types: Set<string>; values: Set<string> } {
  const types = new Set<string>(), values = new Set<string>();
  const union = (j: number) => {
    const vs: string[] = [];
    while (toks[j]?.kind === "str" || isP(toks[j], "|")) {
      if (toks[j].kind === "str") vs.push(toks[j].value.slice(1, -1));
      j++;
    }
    return vs;
  };
  for (let j = 0; j < toks.length; j++) {
    const t = toks[j];
    if (
      t.value === "type" && toks[j + 1]?.kind === "id" &&
      LIFECYCLE_TYPE.test(toks[j + 1].value) && isP(toks[j + 2], "=")
    ) {
      types.add(toks[j + 1].value);
      union(j + 3).forEach((v) => values.add(v));
    }
    if (
      t.kind === "id" && LIFECYCLE_FIELD.test(t.value) &&
      (isP(toks[j + 1], ":") ||
        (isP(toks[j + 1], "?") && isP(toks[j + 2], ":")))
    ) {
      union(j + (isP(toks[j + 1], ":") ? 2 : 3)).forEach((v) => values.add(v));
    }
  }
  return { types, values };
}

function statusTables(toks: Tok[]): Map<string, StatusTable> {
  const out = new Map<string, StatusTable>();
  const { types, values } = lifecycleValues(toks);
  const isLifecycleType = (n: string | undefined) =>
    !!n && (types.has(n) || LIFECYCLE_TYPE.test(n));
  for (let j = 1; j < toks.length; j++) {
    const kw = toks[j - 1].value;
    if (!(kw === "const" || kw === "let") || toks[j].kind !== "id") continue;
    let keyStatus = false, valueStatus = false;
    let i = j + 1;
    if (isP(toks[i], ":")) {
      if (toks[i + 1]?.value === "Record" && isP(toks[i + 2], "<")) {
        keyStatus = isLifecycleType(toks[i + 3]?.value);
        const comma = toks.findIndex((x, n) => n > i + 2 && isP(x, ","));
        valueStatus = comma > 0 && isLifecycleType(toks[comma + 1]?.value) &&
          isP(toks[comma + 2], ">");
      }
      while (i < toks.length && !isP(toks[i], "=") && !isP(toks[i], ";")) i++;
    }
    if (!isP(toks[i], "=")) continue;
    // the entries: [key token, first value token] pairs
    const entries: [Tok, Tok][] = [];
    if (isP(toks[i + 1], "{")) {
      const close = matchBracket(toks, i + 1);
      let depth = 0;
      for (let n = i + 2; n < close; n++) {
        const v = toks[n].kind === "punct" ? toks[n].value : "";
        if (v === "(" || v === "[" || v === "{") depth++;
        else if (v === ")" || v === "]" || v === "}") depth--;
        else if (v === ":" && depth === 0) {
          entries.push([toks[n - 1], toks[n + 1]]);
        }
      }
    } else if (
      toks[i + 1]?.value === "new" && toks[i + 2]?.value === "Map" &&
      isP(toks[i + 3], "(") && isP(toks[i + 4], "[")
    ) {
      const close = matchBracket(toks, i + 4);
      for (let n = i + 5; n < close; n++) {
        if (!isP(toks[n], "[")) continue;
        const end = matchBracket(toks, n);
        if (isP(toks[n + 2], ",")) entries.push([toks[n + 1], toks[n + 3]]);
        n = end;
      }
    } else continue;
    if (entries.length < 2) continue;
    const unq = (t: Tok) => t.kind === "str" ? t.value.slice(1, -1) : t.value;
    const keyHits = entries.filter(([k]) => values.has(unq(k))).length;
    const valHits = entries.filter(([, v]) =>
      v.kind === "str" && values.has(unq(v))
    ).length;
    keyStatus ||= keyHits >= 2 && keyHits === entries.length;
    valueStatus ||= valHits >= 2 && valHits === entries.length;
    if (!keyStatus && !valueStatus) continue;
    out.set(toks[j].value, {
      decl: j,
      keyStatus,
      valueStatus,
      labels: entries.every(([, v]) => v.kind === "str" || v.kind === "tmpl"),
    });
  }
  return out;
}

/** How the read of status table `T` at `k` decides behaviour, or null: its
 *  lifecycle value compared (`status() === OFFERED_FROM[cmd]`), or a lookup
 *  keyed by a record's lifecycle field whose values are not labels
 *  (`ACTIONS[order().status]`). */
function tableUse(toks: Tok[], k: number, t: StatusTable): string | null {
  let open = k + 1;
  if (isP(toks[open], ".") && toks[open + 1]?.value === "get") open += 2;
  const bracket = isP(toks[open], "[") || isP(toks[open], "(");
  if (!bracket || (isP(toks[open], "(") && open === k + 1)) return null;
  const close = matchBracket(toks, open);
  if (close < 0) return null;
  const before = toks[k - 1], after = toks[close + 1];
  const compared = (before?.kind === "punct" && COMPARE.has(before.value)) ||
    (after?.kind === "punct" && COMPARE.has(after.value));
  if (t.valueStatus && compared) {
    return "decides which actions a status allows — a client state machine";
  }
  if (t.keyStatus && !t.labels) {
    const key = operandFwd(toks, open + 1);
    const leaf = key.names[key.names.length - 1];
    if (
      isData(key) && key.end === close - 1 && LIFECYCLE_FIELD.test(leaf ?? "")
    ) {
      return `is looked up by \`${
        toks.slice(open + 1, close).map((x) => x.value).join("")
      }\` to decide data — a client state machine`;
    }
  }
  return null;
}

/** Does the expression holding operator `k` end in a template pipe
 *  (`cents / 100 | currency`) at the same bracket depth? */
function piped(toks: Tok[], k: number): boolean {
  let depth = 0;
  for (let j = k + 1; j < toks.length; j++) {
    const v = toks[j].kind === "punct" ? toks[j].value : "";
    if (v === "(" || v === "[" || v === "{") depth++;
    else if (v === ")" || v === "]" || v === "}") {
      if (--depth < 0) return false;
    } else if (depth === 0 && v === "|") return true;
    else if (
      depth === 0 && (v === "," || v === ";" || v === "?" || v === ":")
    ) {
      return false;
    }
  }
  return false;
}

/** The last token of `new Date()` / `Date.now()` starting at `i`. */
function clockEnd(toks: Tok[], i: number): number {
  return toks[i]?.value === "new" ? i + 3 : i + 4;
}

/** The last token of the call / member chain starting at `i`. */
function exprEnd(toks: Tok[], i: number): number {
  let j = i;
  if (toks[j]?.value === "new") j++;
  for (;;) {
    if (isP(toks[j + 1], ".") || isP(toks[j + 1], "?.")) j += 2;
    else if (isP(toks[j + 1], "(") || isP(toks[j + 1], "[")) {
      j = matchBracket(toks, j + 1);
    } else return j;
    if (j < 0) return i;
  }
}

/** The first token of the call / member chain ending at `j`. */
function exprStart(toks: Tok[], j: number): number {
  let i = j;
  for (;;) {
    if (isP(toks[i], ")") || isP(toks[i], "]")) i = matchBracket(toks, i) - 1;
    if (i < 0) return j;
    if (isP(toks[i - 1], ".") || isP(toks[i - 1], "?.")) i -= 2;
    else return toks[i - 1]?.value === "new" ? i - 1 : i;
  }
}

/** Is the access-named token at `k` compared, switched on, used as a lookup
 *  key, or tested for membership? */
function accessUse(toks: Tok[], k: number): boolean {
  const prev = toks[k - 1];
  const leafAt = isP(prev, ".") || isP(prev, "?.") || !isP(toks[k + 1], ".");
  if (!leafAt || isP(toks[k + 1], ":") || prev?.value === "type") return false;
  let end = k;
  if (isP(toks[end + 1], "(") && isP(toks[end + 2], ")")) end += 2;
  let start = k;
  while (isP(toks[start - 1], ".") || isP(toks[start - 1], "?.")) {
    let j = start - 2;
    if (isP(toks[j], ")")) j = matchBracket(toks, j) - 1;
    if (toks[j]?.kind !== "id") break;
    start = j;
  }
  const next = toks[end + 1], before = toks[start - 1];
  if (next?.kind === "punct" && COMPARE.has(next.value)) return true;
  if (before?.kind === "punct" && COMPARE.has(before.value)) return true;
  if (isP(before, "[") && isP(next, "]")) {
    const recv = toks[start - 2];
    return recv?.kind === "id" || isP(recv, ")") || isP(recv, "]");
  }
  if (
    isP(next, ".") && MEMBERSHIP.has(toks[end + 2]?.value) &&
    isP(toks[end + 3], "(")
  ) return true;
  if (isP(before, "(") && (isP(next, ")") || isP(next, ","))) {
    const callee = toks[start - 2];
    if (callee?.value === "switch") return true;
    return MEMBERSHIP.has(callee?.value) && isP(toks[start - 3], ".");
  }
  return false;
}

/** Is the expression in tokens [a, b] a data read whose leaf is a lifecycle
 *  field (`order().status`, `this.state`)? A bare signal (`status()`) is UI
 *  state and does not count — only a field OF a record. */
function lifecycleSubject(toks: Tok[], a: number, b: number): boolean {
  const o = operandFwd(toks, a);
  return o.kind === "member" && o.end === b &&
    LIFECYCLE_FIELD.test(o.names[o.names.length - 1]) && !isGeometry(o);
}

/** Does the condition in tokens [a, b] test a lifecycle field for equality? */
function lifecycleTest(toks: Tok[], a: number, b: number): boolean {
  for (let j = a; j <= b; j++) {
    if (toks[j].kind !== "punct" || !EQUALITY.has(toks[j].value)) continue;
    const L = operandBack(toks, j - 1);
    const R = operandFwd(toks, j + 1);
    if (
      (L.kind === "member" && lifecycleSubject(toks, L.start, L.end)) ||
      (R.kind === "member" && lifecycleSubject(toks, R.start, R.end))
    ) return true;
  }
  return false;
}

/** The token ranges of a switch body's `case`/`default` arms. */
function caseArms(
  toks: Tok[],
  open: number,
  close: number,
): [number, number][] {
  const heads: number[] = [];
  let depth = 0;
  for (let j = open + 1; j < close; j++) {
    const v = toks[j].kind === "punct" ? toks[j].value : "";
    if (v === "(" || v === "[" || v === "{") depth++;
    else if (v === ")" || v === "]" || v === "}") depth--;
    else if (
      depth === 0 && (toks[j].value === "case" || toks[j].value === "default")
    ) heads.push(j);
  }
  return heads.map((h, i) => [h, (heads[i + 1] ?? close) - 1]);
}

/** One branch of an if / else-if / else chain: its condition and body. */
type Branch = { cond: [number, number] | null; body: [number, number] };

/** The branches of the `if` chain starting at token `k`. */
function ifChain(toks: Tok[], k: number): Branch[] {
  const out: Branch[] = [];
  let i = k;
  for (;;) {
    let cond: [number, number] | null = null;
    let at = i;
    if (toks[i]?.value === "if") {
      const close = matchBracket(toks, i + 1);
      if (close < 0) return out;
      cond = [i + 2, close - 1];
      at = close + 1;
    }
    let end: number;
    if (isP(toks[at], "{")) end = matchBracket(toks, at);
    else {
      end = at;
      while (end < toks.length && !isP(toks[end], ";")) end++;
    }
    if (end < 0) return out;
    out.push({ cond, body: [at, end] });
    if (toks[end + 1]?.value !== "else" || !cond) return out;
    i = end + 2;
  }
}

/** Does the branch in tokens [a, b] produce DATA — assign, `.set(`, or return
 *  a value — rather than only a label / class (a lone string literal)? */
function producesData(toks: Tok[], a: number, b: number): boolean {
  const lone = (j: number) =>
    (toks[j]?.kind === "str" || toks[j]?.kind === "tmpl") &&
    (isP(toks[j + 1], ";") || isP(toks[j + 1], ")") || isP(toks[j + 1], "}") ||
      j + 1 > b);
  for (let j = a; j <= b; j++) {
    const t = toks[j];
    if (isP(t, "=") && !lone(j + 1)) return true;
    if (t.value === "return" && t.kind === "id") {
      if (!lone(j + 1) && !isP(toks[j + 1], ";") && !isP(toks[j + 1], "}")) {
        return true;
      }
    }
    if (
      t.value === "set" && isP(toks[j - 1], ".") && isP(toks[j + 1], "(") &&
      !lone(j + 2)
    ) return true;
  }
  return false;
}

/** A `while`/`for`/`do` at `k` whose body `try`s an `await` and catches. */
function retryLoop(toks: Tok[], k: number): boolean {
  let body = k + 1;
  if (toks[k].value !== "do") {
    if (!isP(toks[k + 1], "(")) return false;
    body = matchBracket(toks, k + 1) + 1;
  }
  if (!isP(toks[body], "{")) return false;
  const end = matchBracket(toks, body);
  for (let j = body + 1; j < end; j++) {
    if (toks[j].value !== "try" || !isP(toks[j + 1], "{")) continue;
    const tryEnd = matchBracket(toks, j + 1);
    const awaits = toks.slice(j + 1, tryEnd).some((x) => x.value === "await");
    if (awaits && toks[tryEnd + 1]?.value === "catch") return true;
  }
  return false;
}

/** Is the comparison at operator `k` the test of a ternary (possibly through
 *  `&&` / `||`) whose every arm holds a string literal — a label? */
function labelTernary(toks: Tok[], k: number): boolean {
  let depth = 0, q = -1;
  for (let j = k + 1; j < toks.length; j++) {
    const v = toks[j].kind === "punct" ? toks[j].value : "";
    if (v === "(" || v === "[" || v === "{") depth++;
    else if (v === ")" || v === "]" || v === "}") {
      if (--depth < 0) return false;
    } else if (depth === 0 && v === "?") {
      q = j;
      break;
    } else if (depth === 0 && (v === "," || v === ";" || v === ":")) {
      return false;
    }
  }
  if (q < 0) return false;
  const arms: [number, number][] = [];
  let from = q + 1, nest = 0;
  depth = 0;
  for (let j = q + 1; j <= toks.length; j++) {
    const v = toks[j]?.kind === "punct" ? toks[j].value : "";
    if (j === toks.length) {
      arms.push([from, j - 1]);
      break;
    }
    if (v === "(" || v === "[" || v === "{") depth++;
    else if (v === ")" || v === "]" || v === "}") {
      if (--depth < 0) {
        arms.push([from, j - 1]);
        break;
      }
    } else if (depth === 0 && v === "?") nest++;
    else if (depth === 0 && v === ":") {
      if (nest > 0) nest--;
      else if (arms.length === 0) {
        arms.push([from, j - 1]);
        from = j + 1;
      } else {
        arms.push([from, j - 1]);
        break;
      }
    } else if (depth === 0 && (v === "," || v === ";")) {
      arms.push([from, j - 1]);
      break;
    }
  }
  return arms.length === 2 &&
    arms.every(([a, b]) =>
      toks.slice(a, b + 1).some((t) => t.kind === "str" || t.kind === "tmpl")
    );
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
function templateHandlers(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/\(([\w.:-]+)\)\s*=\s*"([^"]*)"/g)) {
    for (const c of m[2].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) out.add(c[1]);
  }
  return out;
}

/** Template children that are not expressions. */
const NOT_EXPR = new Set([
  "binding_name",
  "block",
  "else_clause",
  "else_if_clause",
  "case_clause",
  "default_clause",
  "ERROR",
  "comment",
]);
/** A binding whose value only styles or labels the element. */
const PRESENTATION_BINDING = /^(class|style|attr\.(aria-|role$|title$|data-))/;

/** The `<!-- sprig-logic: <reason> -->` lines of a template (the comment's line
 *  and the line below it). */
function templateSuppressions(html: string): Map<number, string> {
  const out = new Map<number, string>();
  html.split("\n").forEach((text, idx) => {
    const m = text.match(/<!--\s*sprig-logic:\s*(\S.*?)\s*-->/);
    if (!m) return;
    out.set(idx + 1, m[1]);
    if (!out.has(idx + 2)) out.set(idx + 2, m[1]);
  });
  return out;
}

/** REQ-050 AMENDMENT — logic-placement over one `template.html`: every
 *  expression the compiler's parser finds (`@let` values, `{{ }}`
 *  interpolations, `[prop]` / `[(two-way)]` / `(event)` bindings, `@if` /
 *  `@else if` / `@switch` subjects) runs rules (a)(b)(c)(e) exactly as in
 *  logic.ts, at its template line, with two presentation carve-outs for (b):
 *  a comparison whose ternary arms are all labels (hold a string) renders a
 *  label, and one inside a `[class…]` / `[style…]` / `[attr.aria-…]` /
 *  `[attr.role|title|data-…]` binding only styles — both are presentation.
 *  Everything else a comparison feeds is logic: an `@if` / `@else if`
 *  condition, a `@let` value and any other `[prop]` binding count as branch
 *  conditions (`[disabled]="line.qty > line.stock"`). A member ×/÷ 10|100|1000
 *  piped to a formatter (`cents / 100 | currency`) is units, not a rate. Plus: an `@switch` on, or an
 *  `@if` chain testing, a record's lifecycle field (`o.status`, `x.state`,
 *  `…stage`, `…phase`) with two or more branches that render an `(event)`
 *  binding decides what the user may do — (e). `<!-- sprig-logic: <reason> -->`
 *  suppresses its line and the next. */
export async function checkTemplateLogic(
  html: string,
  file: string,
): Promise<Pick<LintResult, "findings" | "suppressed">> {
  const root = await parseTemplate(html, { allowError: true });
  const raw: Finding[] = [];
  const run = (
    expr: Node,
    mode: { branch?: boolean; presentation?: boolean },
  ) => {
    const row = expr.startPosition.row, col = expr.startPosition.column;
    const synth = `${mode.branch ? "if (" : "("}\n${
      " ".repeat(col)
    }${expr.text}\n${mode.branch ? ") {}" : ");"}`;
    const r = checkLogicSource(synth, file, {
      rules: "abce",
      labels: true,
      presentation: mode.presentation,
    });
    for (const f of r.findings) raw.push({ ...f, line: row + f.line - 1 });
  };
  const exprs = (n: Node, skipFirst = false) => {
    const out: Node[] = [];
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (!c || NOT_EXPR.has(c.type) || (skipFirst && i === 0)) continue;
      out.push(c);
    }
    return out;
  };
  const hasEvent = (n: Node): boolean =>
    n.type === "event_binding" ||
    Array.from({ length: n.namedChildCount }, (_, i) => n.namedChild(i))
      .some((c: Node) => c && hasEvent(c));
  const lifecycle = (e: Node): boolean => {
    const walk = (n: Node): boolean => {
      if (
        n.type === "member_expression" || n.type === "safe_member_expression"
      ) {
        const leaf = n.namedChild(n.namedChildCount - 1);
        if (leaf && LIFECYCLE_FIELD.test(leaf.text)) return true;
      }
      for (let i = 0; i < n.namedChildCount; i++) {
        const c = n.namedChild(i);
        if (c && walk(c)) return true;
      }
      return false;
    };
    return walk(e);
  };
  const branchBlocks = (n: Node): { cond: Node | null; block: Node }[] => {
    const out: { cond: Node | null; block: Node }[] = [];
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (!c) continue;
      if (c.type === "block") out.push({ cond: exprs(n)[0] ?? null, block: c });
      if (c.type === "else_if_clause" || c.type === "else_clause") {
        out.push(...branchBlocks(c));
      }
      if (c.type === "case_clause" || c.type === "default_clause") {
        for (let j = 0; j < c.namedChildCount; j++) {
          const bc = c.namedChild(j);
          if (bc?.type === "block") out.push({ cond: null, block: bc });
        }
      }
    }
    return out;
  };
  const visit = (n: Node) => {
    switch (n.type) {
      case "let_declaration":
        for (const e of exprs(n, true)) run(e, { branch: true });
        break;
      case "interpolation":
      case "event_binding":
        for (const e of exprs(n)) run(e, {});
        break;
      case "property_binding":
      case "two_way_binding": {
        const name = n.namedChild(0)?.text ?? "";
        const presentation = PRESENTATION_BINDING.test(name);
        for (const e of exprs(n)) run(e, { branch: true, presentation });
        break;
      }
      case "if_block":
      case "else_if_clause":
        for (const e of exprs(n)) run(e, { branch: true });
        break;
      case "switch_block":
        for (const e of exprs(n)) run(e, {});
        break;
    }
    if (n.type === "switch_block" || (n.type === "if_block")) {
      const subjects = n.type === "switch_block" ? exprs(n).slice(0, 1) : [
        ...exprs(n),
        ...branchBlocks(n).map((b) => b.cond).filter((c): c is Node => !!c),
      ];
      const acting = branchBlocks(n).filter((b) => hasEvent(b.block)).length;
      if (subjects.some(lifecycle) && acting >= 2) {
        raw.push({
          rule: "logic-placement/e",
          file,
          line: n.startPosition.row + 1,
          col: n.startPosition.column + 1,
          message: `(e) an \`@${
            n.type === "switch_block" ? "switch" : "if"
          }\` on a lifecycle field renders different actions in ${acting} branches — ${ACCESS}`,
          hint: HINT_ACCESS,
          severity: "error",
        });
      }
    }
    for (let i = 0; i < n.namedChildCount; i++) {
      const c = n.namedChild(i);
      if (c) visit(c);
    }
  };
  visit(root);
  raw.sort((a, b) => a.line - b.line);
  const out: LintResult = { findings: [], suppressed: [], checked: [] };
  applySuppressions(out, file, raw, templateSuppressions(html));
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
  const { templates } = await collectUiFiles(opts.uiSrc);
  if (!scoped.length && !templates.length) {
    result.skipped =
      `no island logic.ts, page resolve.ts or template.html under ${opts.uiSrc}`;
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
  for (const file of templates) {
    const r = await checkTemplateLogic(await Deno.readTextFile(file), file);
    result.checked.push(file);
    result.findings.push(...r.findings);
    result.suppressed.push(...r.suppressed);
  }
  return result;
}
