// Template parsing (SERVER ONLY): load the tree-sitter-angular-template grammar
// (compiled to wasm, no Rust) once and parse template.html into an AST. web-tree-
// sitter is a pure-wasm runtime, so this works in Deno with no native build. The
// browser never imports this file (it walks the serialized JsonNode instead).
import { Language, Parser } from "web-tree-sitter";
import { fromFileUrl } from "@std/path";
import type { Node } from "./node.ts";

export type { Node };
export { field, named } from "./node.ts";

let parserPromise: Promise<Parser> | null = null;

function loadParser(): Promise<Parser> {
  return (parserPromise ??= (async () => {
    await Parser.init();
    // The tree-sitter grammar wasm sits next to this module. Read it directly when local
    // (file://), and fetch only when this module is served remotely (https:// — i.e. published
    // on JSR), so a local run never goes through fetch.
    //
    // ⚠️ It is named `grammar.bin`, NOT `grammar.wasm`, ON PURPOSE — do NOT rename it back.
    // JSR/`deno publish` treats any `.wasm` file as a Wasm ES module and rewrites its single
    // import module `env` → `./env` (the wasm-ESM ABI) on ingest. web-tree-sitter's
    // `Language.load(bytes)` instantiates the raw bytes with an `env` import and throws on the
    // rewritten `./env` form ("Import #0 \"./env\": module is not an object or function"), so a
    // `.wasm` name ships a grammar that can't load from JSR. A non-`.wasm` name is served as
    // opaque bytes, byte-identical to the repo. (web-tree-sitter ignores the extension entirely.)
    const wasmUrl = new URL("./grammar.bin", import.meta.url);
    const bytes = wasmUrl.protocol === "file:"
      ? await Deno.readFile(fromFileUrl(wasmUrl))
      : new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
    const lang = await Language.load(bytes);
    const parser = new Parser();
    parser.setLanguage(lang);
    return parser;
  })());
}

/** Did tree-sitter recover from a syntax error in this (sub)tree? web-tree-sitter
 *  is error-tolerant: malformed input yields a non-null tree with ERROR/MISSING
 *  nodes and `rootNode.hasError === true` instead of throwing. */
export function hasParseError(node: Node): boolean {
  return node?.hasError === true;
}

// The block keywords the Angular-flavored grammar lexes after `@` in text
// content. Anything else after `@` cannot open a block, so a bare `@` there is
// prose (an email, a handle) — escape it instead of letting the parse die.
const BLOCK_KEYWORD =
  /^(?:if|else|for|empty|let|switch|case|default|defer|placeholder|loading|error)\b/;

/** Escape a bare `@` in TEXT content as `&#64;` so the grammar doesn't lex it as
 *  a control-flow opener. Only `@` NOT followed by a block keyword is escaped,
 *  and only in plain text — tags, comments, interpolations and raw
 *  script/style content pass through untouched (`@media` in <style> and
 *  decorators in <script> are real syntax there). The entity is invisible to
 *  the reader: text nodes are emitted raw into HTML on the server, and the
 *  client applies re-renders via innerHTML, so both channels display `@`. */
export function escapeLooseAt(html: string): string {
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    const ch = html[i];
    if (ch === "<") {
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        const stop = end === -1 ? n : end + 3;
        out += html.slice(i, stop);
        i = stop;
        continue;
      }
      const raw = /^<(script|style)\b/i.exec(html.slice(i, i + 8));
      if (raw) {
        const close = new RegExp(`</${raw[1]}\\s*>`, "i").exec(html.slice(i));
        const stop = close ? i + close.index + close[0].length : n;
        out += html.slice(i, stop);
        i = stop;
        continue;
      }
      const end = html.indexOf(">", i + 1);
      const stop = end === -1 ? n : end + 1;
      out += html.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "{" && html[i + 1] === "{") {
      const end = html.indexOf("}}", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += html.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "@" && !BLOCK_KEYWORD.test(html.slice(i + 1, i + 14))) {
      out += "&#64;";
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// EXPRESSION STRING LITERALS. The grammar's `string` token is single-quoted only
// (`/'([^'\\]|\\.)*'/`): inside a "-delimited attribute value a double-quoted
// literal is ambiguous with the closing delimiter, so it was never taught the
// form (tree-sitter-angular-template/README.md, "Known limitations"). But in TEXT
// position — a `{{ … }}` interpolation, an `@if (…)` / `@case (…)` block header —
// there is no attribute delimiter to collide with, and `"x"` is simply what people
// write: sprig's own two workbench templates did, and took `sprig dev` down at boot
// with them. So normalize those two contexts to the single-quoted form before the
// grammar sees them (same pre-pass discipline as escapeLooseAt / quoteWiringLonghand
// above — offsets shift, every consumer reads the source off the tree).
//
// Attribute values are deliberately NOT touched, in either delimiter: rewriting
// `title='say "hi"'` would change the rendered TEXT, and `[x]="a === "b""` is not
// well-formed HTML to begin with. Those get a named error instead (see
// BINDING_ATTR_DQ below).

/** Re-quote the double-quoted string literals in one expression body. Existing
 *  single-quoted literals are copied through verbatim, so a `"` that is CONTENT
 *  (`{{ 'he said "hi"' }}`) is never mistaken for a delimiter. Value-preserving:
 *  a `'` in the old body becomes `\'`, and a `\"` loses the escape it only needed
 *  for the old delimiter. */
function requoteExprStrings(expr: string): string {
  let out = "";
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const ch = expr[i];
    if (ch === "'") { // an existing literal — copy it whole, quotes and all
      let j = i + 1;
      while (j < n && expr[j] !== "'") j += expr[j] === "\\" ? 2 : 1;
      out += expr.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let body = "";
      while (j < n && expr[j] !== '"') {
        if (expr[j] === "\\" && j + 1 < n) {
          // \" needed the escape only for the delimiter we are dropping; every
          // other escape (\n, \\, \uXXXX) is the evaluator's and must survive.
          body += expr[j + 1] === '"' ? '"' : expr.slice(j, j + 2);
          j += 2;
        } else {
          body += expr[j] === "'" ? "\\'" : expr[j];
          j++;
        }
      }
      if (j >= n) { // unterminated — not ours to guess at; let the grammar report it
        out += expr.slice(i);
        break;
      }
      out += `'${body}'`;
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** The end of an `@block (…)` header: the index just past the matching `)`,
 *  counting nesting and skipping quoted strings. -1 when it never closes. */
function headerEnd(html: string, open: number): number {
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < html.length && html[i] !== q) i += html[i] === "\\" ? 2 : 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return -1;
}

/** Normalize double-quoted string literals to the grammar's single-quoted form,
 *  in the two TEXT-position expression contexts where a `"` cannot be an
 *  attribute delimiter: `{{ … }}` and an `@block (…)` header. Tags, comments and
 *  raw <script>/<style> bodies pass through untouched. */
export function singleQuoteExprStrings(html: string): string {
  if (!html.includes('"')) return html; // fast path: nothing to re-quote
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    const ch = html[i];
    if (ch === "<") {
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        const stop = end === -1 ? n : end + 3;
        out += html.slice(i, stop);
        i = stop;
        continue;
      }
      const raw = /^<(script|style)\b/i.exec(html.slice(i, i + 8));
      if (raw) {
        const close = new RegExp(`</${raw[1]}\\s*>`, "i").exec(html.slice(i));
        const stop = close ? i + close.index + close[0].length : n;
        out += html.slice(i, stop);
        i = stop;
        continue;
      }
      const end = html.indexOf(">", i + 1);
      const stop = end === -1 ? n : end + 1;
      out += html.slice(i, stop); // attribute values are not ours to re-quote
      i = stop;
      continue;
    }
    if (ch === "{" && html[i + 1] === "{") {
      const end = html.indexOf("}}", i + 2);
      if (end === -1) {
        out += html.slice(i);
        break;
      }
      out += "{{" + requoteExprStrings(html.slice(i + 2, end)) + "}}";
      i = end + 2;
      continue;
    }
    if (ch === "@" && BLOCK_KEYWORD.test(html.slice(i + 1, i + 14))) {
      const kw = BLOCK_KEYWORD.exec(html.slice(i + 1, i + 14))![0];
      let j = i + 1 + kw.length;
      if (kw === "let") {
        // `@let name = <expr>;` — the header runs to the terminating `;`.
        const end = html.indexOf(";", j);
        if (end !== -1) {
          out += html.slice(i, j) + requoteExprStrings(html.slice(j, end)) +
            ";";
          i = end + 1;
          continue;
        }
      }
      while (j < n && /\s/.test(html[j])) j++;
      // `@else if (…)` — the condition hangs off the `if`, one keyword along.
      if (kw === "else" && html.startsWith("if", j)) {
        j += 2;
        while (j < n && /\s/.test(html[j])) j++;
      }
      if (html[j] === "(") {
        const end = headerEnd(html, j);
        if (end !== -1) {
          out += html.slice(i, j + 1) +
            requoteExprStrings(html.slice(j + 1, end - 1)) + ")";
          i = end;
          continue;
        }
      }
      out += html.slice(i, j);
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// TEMPLATE WIRING longhand (spec §3): `sets:org={selectedOrg}` — the braces hold a
// LITERAL compile-time channel identifier, but the grammar rejects both an unquoted
// `={…}` value AND a bare `{` inside a quoted value. Rewrite it to a quoted,
// entity-encoded form (`sets:org="&#123;selectedOrg&#125;"`) before parsing, so the
// attribute arrives as an ordinary quoted value whose entity-decoded text is the
// `{channel}` literal render.ts's wiring collector reads. Applied only INSIDE
// tags — text content, comments, interpolations and raw <script>/<style> bodies
// pass through untouched (same skip discipline as escapeLooseAt above; offsets
// shift, but every consumer takes the source from the tree itself, so they stay
// coherent).
const WIRE_LONGHAND =
  /(\s(?:sets|reads|edits):[A-Za-z_$][\w$-]*)=\{\s*([A-Za-z_$][\w$]*)\s*\}(?=[\s>/]|$)/g;

/** Quote + entity-encode the wiring-longhand `={channel}` form inside start tags. */
export function quoteWiringLonghand(html: string): string {
  if (!html.includes("={")) return html; // fast path: no longhand anywhere
  let out = "";
  let i = 0;
  const n = html.length;
  while (i < n) {
    const ch = html[i];
    if (ch === "<") {
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        const stop = end === -1 ? n : end + 3;
        out += html.slice(i, stop);
        i = stop;
        continue;
      }
      const raw = /^<(script|style)\b/i.exec(html.slice(i, i + 8));
      if (raw) {
        const close = new RegExp(`</${raw[1]}\\s*>`, "i").exec(html.slice(i));
        const stop = close ? i + close.index + close[0].length : n;
        out += html.slice(i, stop);
        i = stop;
        continue;
      }
      const end = html.indexOf(">", i + 1);
      const stop = end === -1 ? n : end + 1;
      out += html.slice(i, stop).replace(WIRE_LONGHAND, '$1="&#123;$2&#125;"');
      i = stop;
      continue;
    }
    if (ch === "{" && html[i + 1] === "{") {
      const end = html.indexOf("}}", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += html.slice(i, stop);
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// A binding attribute (`[x]`, `(x)`, `[(x)]`, `*x`) whose value carries a
// double-quoted string literal: either a '-delimited value containing a `"`, or a
// "-delimited value that closed early on one. The only expression context
// singleQuoteExprStrings deliberately leaves alone — so it is the one the error
// message has to explain.
const BINDING_ATTR_DQ =
  /(?:\[\(?[\w.$-]+\)?\]|\([\w.$-]+\)|\*[\w-]+)\s*=\s*(?:'[^']*"|"[^"]*"[^\s>/=])/;

/** The first ERROR/MISSING node in the tree — where the syntax error actually is. */
function firstErrorNode(node: Node): Node | null {
  if (node.type === "ERROR" || node.isMissing) return node;
  if (!node.hasError) return null;
  for (let i = 0; i < (node.childCount ?? 0); i++) {
    const child = node.child(i);
    if (!child) continue;
    const found = firstErrorNode(child);
    if (found) return found;
  }
  return node;
}

/** Parse a template string → the root AST node. By default a template that does
 *  not parse cleanly THROWS (so a typo'd/truncated template fails the build and
 *  is never baked into an island chunk / the SSR registry) rather than silently
 *  shipping a tree-sitter ERROR AST. Pass `{ allowError: true }` to inspect a
 *  possibly-broken tree without throwing (the dev HMR reparse path uses this to
 *  suppress the live push instead of clobbering mounted islands). */
export async function parseTemplate(
  html: string,
  opts: { allowError?: boolean } = {},
): Promise<Node> {
  const parser = await loadParser();
  // Prose-proof the text content first (a bare `@` would otherwise lex as a
  // control-flow opener and fail the whole parse), normalize the double-quoted
  // string literals the grammar's single-quoted `string` token can't lex, and
  // quote the wiring-longhand `={channel}` form it can't lex unquoted. Every
  // consumer of this tree takes the source from the tree itself (serialize
  // round-trips rootNode.text, render slices opts.source = template.text), so
  // offsets stay coherent.
  const source = escapeLooseAt(
    quoteWiringLonghand(singleQuoteExprStrings(html)),
  );
  const tree = parser.parse(source);
  if (!tree) throw new Error("template parse returned null");
  const root = tree.rootNode;
  if (!opts.allowError && hasParseError(root)) {
    const err = firstErrorNode(root);
    const at = err?.startPosition
      ? `line ${err.startPosition.row + 1}, column ${
        err.startPosition.column + 1
      }`
      : "unknown position";
    const excerpt = err
      ? source.slice(
        err.startIndex,
        Math.min(err.endIndex, err.startIndex + 80),
      )
      : "";
    // "Fix the template HTML" with no cause is where an afternoon goes. When the
    // failing LINE is a binding attribute carrying a double-quoted string literal
    // — the one expression context that can't be normalized away, because there
    // the `"` really is the delimiter — say so, and say what to write instead.
    const line = err?.startPosition
      ? source.split("\n")[err.startPosition.row] ?? ""
      : "";
    const cause = BINDING_ATTR_DQ.test(line)
      ? "  cause: a double-quoted string literal inside an attribute value — this " +
        "grammar's string literals are single-quoted, and there the `\"` is the " +
        "attribute delimiter.\n" +
        `  fix:   write [x]="a === 'b'" (single-quoted literal, double-quoted attribute).\n`
      : "";
    throw new Error(
      `sprig: template failed to parse cleanly (syntax error at ${at}). ` +
        "Fix the template HTML — a malformed template must not ship.\n" +
        cause +
        `  near: ${JSON.stringify(excerpt)}\n` +
        `  source: ${
          JSON.stringify(
            source.length > 120 ? source.slice(0, 120) + "…" : source,
          )
        }`,
    );
  }
  return root;
}

/** Parse + cache a template source (SSR). */
const PARSE_CACHE = new Map<string, Promise<Node>>();
export function parseCached(source: string): Promise<Node> {
  let p = PARSE_CACHE.get(source);
  if (!p) {
    p = parseTemplate(source);
    PARSE_CACHE.set(source, p);
  }
  return p;
}
