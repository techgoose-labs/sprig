/**
 * optimistic-writes — an island must not make the user wait on the server to
 * see their own action. Only server WRITES (commands) must be optimistic; a
 * server READ (search-as-you-type, load-more) legitimately awaits.
 *
 * An awaited call is a SERVER WRITE when any call in the await's operand is:
 *  • `fetch(…)` / `x.fetch(…)` whose init carries a literal
 *    `method: "POST" | "PUT" | "PATCH" | "DELETE"` (no method or GET = read);
 *  • a member call `.post(` `.put(` `.patch(` `.delete(` (`.get(` = read);
 *  • a typed-client call whose receiver's last segment is `client`
 *    (`client.<op>(`, `this.client.<op>(`): a write when `<op>`'s method in
 *    `<gitRoot>/spec/contract/openapi.json` is not GET, or when `<op>` is not
 *    in it; with no openapi.json EVERY `client.<op>(` is a write (a note says so);
 *  • a callee whose last segment is save | create | update | remove | delete |
 *    send | submit | post | put | patch (bare `save(x)` or `svc.save(x)`);
 *  • any other call whose receiver chain has a segment ending in api | client |
 *    backend (case-insensitive: `this.api.x(`, `todoApi.x(`, `backend.x(`),
 *    unless its name reads as a query: get | list | load | fetch | find |
 *    search | query | read | count (prefix).
 *
 * Two rules, per function body (arrow with a block body, `function`, method;
 * EVERY function in logic.ts, not only template-bound handlers — a helper a
 * handler calls makes the user wait just the same; nested functions judged on
 * their own):
 *  1. a server write awaited BEFORE the first signal write is an error at the
 *     await ("server write awaited before the UI changed");
 *  2. otherwise, a signal write AFTER an awaited server write is an error at
 *     the write ("the UI changed only after the server answered") — the
 *     loading-flag-then-wait spinner — unless the body calls `optimistic(`
 *     (its reconcile owns the post-await write).
 * A signal write is `.set(` / `.update(` / `.value =` / `sig(v)` on a signal the
 * file declares, or `optimistic(`. A function that writes no signal is exempt
 * (counted in a note, as are the awaited reads).
 *
 * `// sprig-wait: <reason>` on the await's line or the line above suppresses
 * either rule for that await (rule 2 also on the write's line) and is listed
 * with the reason; a bare `// sprig-wait:` does not suppress.
 *
 * Reads logic.ts with the shared token scanner (./ts-scan.ts), the same
 * syntactic stance as the wiring lint; no TypeScript dependency.
 */
import { declaredSignals } from "../wiring-lint.ts";
import { readContractOps } from "./contract.ts";
import type { Finding, LintResult } from "./lint-types.ts";
import {
  isDir,
  isP,
  join,
  matchBracket,
  suppressions,
  type Tok,
  tokenize,
  tsFiles,
} from "./ts-scan.ts";

const RULE = "optimistic-writes";
const MESSAGE =
  "server write awaited before the UI changed — use optimistic(sig, next, call) or write the signal first";
const MESSAGE_AFTER =
  "the UI changed only after the server answered — use optimistic(sig, next, call) so the write lands first and reconcile() applies the server's projection";
const HINT =
  "wrap it in optimistic(sig, next, call) — the signal moves now, rolls back on failure; " +
  "if the result is truly unknowable client-side, mark the await `// sprig-wait: <reason>`";

const CONTROL = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "with",
  "return",
  "typeof",
  "await",
]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WRITE_VERBS = new Set([
  "save",
  "create",
  "update",
  "remove",
  "delete",
  "send",
  "submit",
  "post",
  "put",
  "patch",
]);
const QUERY_NAME = /^(get|list|load|fetch|find|search|query|read|count)/i;
const SERVER_RECEIVER = /(api|client|backend)$/i;

/** operationId → HTTP method (upper-case), or null when there is no openapi.json. */
export type ContractOps = Map<string, string> | null;

/** Every signal-ish name the file declares: `x = signal(…)` / `computed` /
 *  `linkedSignal` (the wiring lint's reader), plus `x = ctx.model(…)` and
 *  `x = inject(…)…` handles. */
function signalNames(src: string): Set<string> {
  const out = declaredSignals(src);
  const extra =
    /([A-Za-z_$][\w$]*)\s*(?::\s*[^=;,(){}]+)?=\s*(?:ctx\.model\s*[<(]|inject\s*\()/g;
  for (const m of src.matchAll(extra)) out.add(m[1]);
  return out;
}

interface Fn {
  name: string;
  open: number;
  close: number;
}

/** Function bodies: the `{` after `=>`, or after a parameter list `)` (with an
 *  optional return type) that follows a method name or `function`. */
function functionBodies(toks: Tok[]): Fn[] {
  const out: Fn[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (!isP(toks[i], "{")) continue;
    const close = matchBracket(toks, i);
    if (close < 0) continue;
    const prev = toks[i - 1];
    if (isP(prev, "=>")) {
      out.push({ name: arrowName(toks, i - 1), open: i, close });
      continue;
    }
    const paren = paramClose(toks, i);
    if (paren < 0) continue;
    const po = matchBracket(toks, paren);
    const head = toks[po - 1];
    if (!head || head.kind !== "id" || CONTROL.has(head.value)) continue;
    const name = head.value === "function"
      ? "(anonymous function)"
      : head.value;
    out.push({ name, open: i, close });
  }
  return out;
}

/** The `)` closing a parameter list right before body `{` at `i`, skipping a
 *  return-type annotation `): T {`. -1 when there is none. */
function paramClose(toks: Tok[], i: number): number {
  if (isP(toks[i - 1], ")")) return i - 1;
  for (let k = i - 1; k > 0; k--) {
    const t = toks[k];
    if (t.kind === "punct" && [";", "{", "}", "=", "=>"].includes(t.value)) {
      return -1;
    }
    if (isP(t, ":") && isP(toks[k - 1], ")")) return k - 1;
  }
  return -1;
}

/** `name = async (…) =>` / `name: (…) =>` → "name"; otherwise "(arrow)". */
function arrowName(toks: Tok[], arrow: number): string {
  let k = arrow - 1;
  if (isP(toks[k], ")")) k = matchBracket(toks, k);
  k--;
  if (toks[k]?.kind === "id" && toks[k].value === "async") k--;
  if ((isP(toks[k], "=") || isP(toks[k], ":")) && toks[k - 1]?.kind === "id") {
    return toks[k - 1].value;
  }
  return "(arrow)";
}

/** First signal write in `idx` (token indices of one body, nested masked). */
function firstWrite(toks: Tok[], idx: number[], sigs: Set<string>): number {
  for (let n = 0; n < idx.length; n++) {
    const t = toks[idx[n]];
    if (t.kind !== "id") continue;
    const a = toks[idx[n + 1]], b = toks[idx[n + 2]], c = toks[idx[n + 3]];
    if (t.value === "optimistic" && isP(a, "(")) return idx[n];
    if (!sigs.has(t.value)) continue;
    if (isP(a, ".") && b?.kind === "id") {
      if ((b.value === "set" || b.value === "update") && isP(c, "(")) {
        return idx[n];
      }
      if (b.value === "value" && isP(c, "=")) return idx[n];
    }
    if (isP(a, "(") && !isP(b, ")")) return idx[n];
  }
  return -1;
}

type CallKind = "write" | "read" | "none";

/** The literal `method:` inside the call's argument list opening at `open`. */
function literalMethod(toks: Tok[], open: number): string | null {
  const close = matchBracket(toks, open);
  for (let k = open + 1; k < close - 2; k++) {
    if (
      toks[k].kind === "id" && toks[k].value === "method" &&
      isP(toks[k + 1], ":")
    ) {
      const v = toks[k + 2];
      return v.kind === "str" ? v.value.slice(1, -1).toUpperCase() : null;
    }
  }
  return null;
}

/** Classify the call whose callee name is token `m` (followed by `(`). */
function classifyCall(
  toks: Tok[],
  m: number,
  ops: ContractOps,
  unknownOps: Set<string>,
): CallKind {
  const name = toks[m].value;
  const receivers: string[] = [];
  for (let k = m - 1; isP(toks[k], ".") || isP(toks[k], "?."); k -= 2) {
    if (toks[k - 1]?.kind !== "id") break;
    receivers.unshift(toks[k - 1].value);
  }
  if (name === "fetch") {
    const method = literalMethod(toks, m + 1);
    return method && WRITE_METHODS.has(method) ? "write" : "read";
  }
  if (receivers.length && name === "get") return "read";
  if (receivers[receivers.length - 1] === "client") {
    if (!ops) return "write";
    const method = ops.get(name);
    if (!method) {
      unknownOps.add(name);
      return "write";
    }
    return method === "GET" ? "read" : "write";
  }
  if (WRITE_VERBS.has(name)) return "write";
  if (receivers.some((r) => SERVER_RECEIVER.test(r))) {
    return QUERY_NAME.test(name) ? "read" : "write";
  }
  return "none";
}

/** Every `await` in `idx` whose operand calls the server, in order. */
function serverAwaits(
  toks: Tok[],
  idx: number[],
  ops: ContractOps,
  unknownOps: Set<string>,
): { at: number; kind: "write" | "read" }[] {
  const out: { at: number; kind: "write" | "read" }[] = [];
  for (let n = 0; n < idx.length; n++) {
    const t = toks[idx[n]];
    if (t.kind !== "id" || t.value !== "await") continue;
    const operand = toks[idx[n + 1]];
    if (operand?.kind === "id" && operand.value === "optimistic") continue;
    let depth = 0, kind: CallKind = "none";
    for (let m = n + 1; m < idx.length && kind !== "write"; m++) {
      const u = toks[idx[m]];
      if (u.kind === "punct") {
        if (["(", "[", "{"].includes(u.value)) depth++;
        else if ([")", "]", "}"].includes(u.value)) {
          if (--depth < 0) break;
        } else if (depth === 0 && (u.value === ";" || u.value === ",")) break;
      }
      if (u.kind !== "id" || !isP(toks[idx[m] + 1], "(")) continue;
      const k = classifyCall(toks, idx[m], ops, unknownOps);
      if (k !== "none") kind = k;
    }
    if (kind !== "none") out.push({ at: idx[n], kind });
  }
  return out;
}

/** Every signal write in `idx`, in order, each at the token where it takes
 *  effect: the close of its call's argument list for `sig.set(…)` /
 *  `sig.update(…)` / `sig(…)` (so `items.set(await x())` writes AFTER the
 *  await), the name itself for `.value =` and `optimistic(` (synchronous). */
function signalWrites(
  toks: Tok[],
  idx: number[],
  sigs: Set<string>,
): { at: number; start: number }[] {
  const out: { at: number; start: number }[] = [];
  for (let n = 0; n < idx.length; n++) {
    const w = firstWrite(toks, idx.slice(n, n + 4), sigs);
    if (w !== idx[n]) continue;
    if (toks[w].value === "optimistic") {
      out.push({ at: w, start: w });
      continue;
    }
    const open = isP(toks[w + 1], "(")
      ? w + 1
      : isP(toks[w + 3], "(")
      ? w + 3
      : -1;
    const close = open < 0 ? -1 : matchBracket(toks, open);
    out.push({ at: close < 0 ? w : close, start: w });
  }
  return out.sort((x, y) => x.at - y.at);
}

export interface SourceLint {
  findings: Finding[];
  suppressed: LintResult["suppressed"];
  /** functions that await a server write but write no signal; awaited reads */
  exempt: { noWrite: number; queries: number };
  /** `client.<op>` names openapi.json does not know (treated as writes) */
  unknownOps: string[];
}

/** Lint one logic.ts source. `file` is how findings name it; `ops` is the
 *  contract's operationId → method map (null/absent: no openapi.json). */
export function lintOptimisticSource(
  src: string,
  file: string,
  ops: ContractOps = null,
): SourceLint {
  const toks = tokenize(src);
  const sigs = signalNames(src);
  const fns = functionBodies(toks);
  const supp = suppressions(src, "sprig-wait");
  const unknownOps = new Set<string>();
  const out: SourceLint = {
    findings: [],
    suppressed: [],
    exempt: { noWrite: 0, queries: 0 },
    unknownOps: [],
  };
  const report = (
    line: number,
    col: number,
    message: string,
    awaitLine: number,
  ) => {
    const reason = supp.get(awaitLine) ?? supp.get(line);
    if (reason !== undefined) {
      out.suppressed.push({
        file,
        line: supp.has(awaitLine) ? awaitLine : line,
        reason,
      });
      return;
    }
    out.findings.push({
      rule: RULE,
      file,
      line,
      col,
      message,
      hint: HINT,
      severity: "error",
    });
  };
  for (const fn of fns) {
    const nested = fns.filter((g) =>
      g !== fn && g.open > fn.open && g.close < fn.close
    );
    const idx: number[] = [];
    for (let i = fn.open + 1; i < fn.close; i++) {
      const inner = nested.find((g) => i >= g.open && i <= g.close);
      if (inner) {
        i = inner.close;
        continue;
      }
      idx.push(i);
    }
    const awaits = serverAwaits(toks, idx, ops, unknownOps);
    out.exempt.queries += awaits.filter((a) => a.kind === "read").length;
    const wait = awaits.find((a) => a.kind === "write")?.at;
    if (wait === undefined) continue;
    const writes = signalWrites(toks, idx, sigs);
    if (writes.length === 0) {
      out.exempt.noWrite++;
      continue;
    }
    const w = toks[wait];
    if (writes[0].at > wait) {
      report(
        w.line,
        w.col,
        `${MESSAGE} (in ${fn.name}, first signal write at line ${
          toks[writes[0].start].line
        })`,
        w.line,
      );
      continue;
    }
    const callsOptimistic = idx.some((i) =>
      toks[i].kind === "id" && toks[i].value === "optimistic" &&
      isP(toks[i + 1], "(")
    );
    const after = writes.find((x) => x.at > wait);
    if (callsOptimistic || after === undefined) continue;
    const a = toks[after.start];
    report(
      a.line,
      a.col,
      `${MESSAGE_AFTER} (in ${fn.name}, awaited server write at line ${w.line})`,
      w.line,
    );
  }
  out.unknownOps = [...unknownOps].sort();
  return out;
}

/** operationId → METHOD, read through the one contract reader (./contract.ts). */
async function contractOps(gitRoot: string | undefined): Promise<ContractOps> {
  const ops = await readContractOps(gitRoot);
  return ops && new Map([...ops].map(([id, op]) => [id, op.method]));
}

/** Lint every island `logic.ts` under `uiSrc`. Findings name files relative
 *  to `uiSrc`. `gitRoot` locates `spec/contract/openapi.json` for `client.<op>`. */
export async function lintOptimisticWrites(
  opts: { uiSrc: string; gitRoot?: string },
): Promise<LintResult> {
  const result: LintResult = {
    findings: [],
    suppressed: [],
    checked: [],
    notes: [],
  };
  if (!(await isDir(opts.uiSrc))) {
    return { ...result, skipped: `no ui source directory at ${opts.uiSrc}` };
  }
  const files = await tsFiles(
    opts.uiSrc,
    (rel) => rel === "logic.ts" || rel.endsWith("/logic.ts"),
  );
  if (files.length === 0) {
    return { ...result, skipped: `no island logic.ts under ${opts.uiSrc}` };
  }
  const ops = await contractOps(opts.gitRoot);
  const exempt = { noWrite: 0, queries: 0 };
  const unknown = new Set<string>();
  for (const rel of files) {
    const src = await Deno.readTextFile(join(opts.uiSrc, rel));
    const r = lintOptimisticSource(src, rel, ops);
    result.findings.push(...r.findings);
    result.suppressed.push(...r.suppressed);
    result.checked.push(rel);
    exempt.noWrite += r.exempt.noWrite;
    exempt.queries += r.exempt.queries;
    r.unknownOps.forEach((o) => unknown.add(o));
  }
  result.notes!.push(
    ops
      ? `client.<op>() classified by spec/contract/openapi.json (${ops.size} operations)`
      : `no spec/contract/openapi.json under ${
        opts.gitRoot ?? "(no gitRoot given)"
      } — treating every client.<op>() as a write`,
  );
  if (unknown.size) {
    result.notes!.push(
      `client.<op>() not in openapi.json, treated as writes: ${
        [...unknown].sort().join(", ")
      }`,
    );
  }
  result.notes!.push(
    `${exempt.noWrite} function(s) await a server write but write no signal — exempt; ${exempt.queries} awaited server read(s) — exempt`,
  );
  return result;
}
