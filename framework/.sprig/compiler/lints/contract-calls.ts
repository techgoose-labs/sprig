/**
 * contract-calls (REQ-022) — when the app has a typed contract client
 * (`<git-root>/spec/contract/client/`), every call the UI makes to the
 * backend goes through it. Flags, over every `.ts` under the ui source:
 *   • `fetch(` with a string or template-literal URL;
 *   • any `fetch(` at all in an island `logic.ts` (islands use the client too);
 *   • `inject(Backend)` not passed straight into `createClient(...)`;
 *   • `.get(` / `.get<T>(` / `.fetch(` on a Backend-injected value with a
 *     literal path.
 * `// sprig-contract: <reason>` on the line (or the line above) suppresses it.
 * With no contract client there is nothing to enforce: the result says so.
 */
import { join } from "@std/path";
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

export const CONTRACT_HINT =
  "call the typed client (spec/contract/client) — reads are queries, writes are commands; " +
  "`// sprig-contract: <reason>` if this call is truly outside the contract";

const STMT_START = new Set([";", "{", "}", "(", ","]);
const DECL_WORDS = new Set([
  "const",
  "let",
  "var",
  "private",
  "public",
  "protected",
  "readonly",
  "static",
]);

/** The name a `… = inject(Backend)` assignment binds, or null. */
function boundName(toks: Tok[], eq: number): string | null {
  let s = eq - 1;
  while (
    s >= 0 && !(toks[s].kind === "punct" && STMT_START.has(toks[s].value))
  ) s--;
  const span = toks.slice(s + 1, eq);
  const colon = span.findIndex((t) => isP(t, ":"));
  const head = colon < 0 ? span : span.slice(0, colon);
  const ids = head.filter((t) => t.kind === "id" && !DECL_WORDS.has(t.value));
  return ids.length ? ids[ids.length - 1].value : null;
}

/** Index of the `(` that opens a call's arguments at `i`, skipping `<T>` generics. */
function callParen(toks: Tok[], i: number): number {
  if (isP(toks[i], "(")) return i;
  if (!isP(toks[i], "<")) return -1;
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    const v = toks[j].kind === "punct" ? toks[j].value : "";
    if (v === "<") depth++;
    else if (v === ">") depth--;
    else if (v === ">>") depth -= 2;
    else if (v === ";" || v === "=>") {
      if (depth <= 0) return -1;
    }
    if (depth <= 0) return isP(toks[j + 1], "(") ? j + 1 : -1;
  }
  return -1;
}

const isLiteral = (t: Tok | undefined) =>
  !!t && (t.kind === "str" || t.kind === "tmpl");

/** Contract-call findings for one source file, suppressions applied. */
export function checkContractSource(
  src: string,
  file: string,
  opts: { island: boolean },
): Pick<LintResult, "findings" | "suppressed"> {
  const toks = tokenize(src);
  const raw: Finding[] = [];
  const add = (t: Tok, rule: string, message: string) =>
    raw.push({
      rule: `contract-calls/${rule}`,
      file,
      line: t.line,
      col: t.col,
      message,
      hint: CONTRACT_HINT,
      severity: "error",
    });
  const handles = new Set<string>();

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.kind !== "id") continue;
    const prev = toks[k - 1];

    if (
      t.value === "inject" && isP(toks[k + 1], "(") &&
      toks[k + 2]?.value === "Backend" && isP(toks[k + 3], ")")
    ) {
      const intoClient = isP(prev, "(") &&
        toks[k - 2]?.value === "createClient";
      if (!intoClient) {
        add(
          t,
          "raw-backend",
          "inject(Backend) is not passed straight into createClient(...)",
        );
        if (isP(prev, "=")) {
          const name = boundName(toks, k - 1);
          if (name) handles.add(name);
        }
        const dot = k + 4;
        if (
          isP(toks[dot], ".") && ["get", "fetch"].includes(toks[dot + 1]?.value)
        ) {
          const p = callParen(toks, dot + 2);
          if (p >= 0 && isLiteral(toks[p + 1])) {
            add(
              toks[dot + 1],
              "literal-backend-path",
              `Backend .${toks[dot + 1].value}(${
                toks[p + 1].value
              }) calls a literal path`,
            );
          }
        }
      }
      continue;
    }

    if (
      handles.has(t.value) && isP(toks[k + 1], ".") &&
      ["get", "fetch"].includes(toks[k + 2]?.value)
    ) {
      const p = callParen(toks, k + 3);
      if (p >= 0 && isLiteral(toks[p + 1])) {
        add(
          toks[k + 2],
          "literal-backend-path",
          `${t.value}.${toks[k + 2].value}(${
            toks[p + 1].value
          }) calls a literal path on the injected Backend`,
        );
      }
      continue;
    }

    if (t.value === "fetch" && isP(toks[k + 1], "(")) {
      const member = isP(prev, ".") || isP(prev, "?.");
      const globalMember = member &&
        ["globalThis", "window", "self"].includes(toks[k - 2]?.value);
      if (member && !globalMember) continue;
      if (prev?.value === "function") continue;
      const close = matchBracket(toks, k + 1);
      const after = toks[close + 1];
      if (isP(after, "{") || isP(after, ":")) continue; // a definition, not a call
      const arg = toks[k + 2];
      const start = globalMember ? toks[k - 2] : t;
      if (opts.island) {
        add(
          start,
          "island-fetch",
          `fetch(${
            isLiteral(arg) ? arg.value : "…"
          }) in island logic.ts — islands call the backend through the typed client too`,
        );
      } else if (isLiteral(arg)) {
        add(
          start,
          "literal-fetch",
          `fetch(${arg.value}) calls a literal URL around the contract`,
        );
      }
    }
  }
  const out: LintResult = { findings: [], suppressed: [], checked: [] };
  applySuppressions(out, file, raw, suppressions(src, "sprig-contract"));
  return out;
}

/** Run contract-calls over every `.ts` under `uiSrc` — or report it skipped
 *  when `<gitRoot>/spec/contract/client/` does not exist. */
export async function lintContractCalls(
  opts: { uiSrc: string; gitRoot: string },
): Promise<LintResult> {
  const result: LintResult = { findings: [], suppressed: [], checked: [] };
  if (!(await isDir(join(opts.gitRoot, "spec", "contract", "client")))) {
    result.skipped = `no spec/contract/client at ${opts.gitRoot}`;
    return result;
  }
  if (!(await isDir(opts.uiSrc))) {
    result.skipped = `no ui source at ${opts.uiSrc}`;
    return result;
  }
  for (const rel of await tsFiles(opts.uiSrc, () => true)) {
    const file = join(opts.uiSrc, rel);
    const src = await Deno.readTextFile(file);
    const r = checkContractSource(src, file, {
      island: rel === "logic.ts" || rel.endsWith("/logic.ts"),
    });
    result.checked.push(file);
    result.findings.push(...r.findings);
    result.suppressed.push(...r.suppressed);
  }
  return result;
}
