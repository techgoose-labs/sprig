/**
 * `tokens` — hold every style an app writes to its design tokens
 * (`ui/src/css-variables.json`, a map of `--*` custom properties → values).
 *
 * Scanned: every unit's `styles.css`, every `style="…"` attribute and every
 * `<style>` block in every `template.html`. Rules (all errors):
 *  (a) a raw color literal — `#hex`, `rgb()`/`rgba()`/`hsl()`/`hsla()`/`hwb()`/
 *      `lab()`/`lch()`/`oklab()`/`oklch()`/`color()`, or a named CSS color
 *      (`transparent`, `currentColor` and the CSS-wide keywords are not colors
 *      here). A color function whose arguments use `var(` composes a token and
 *      passes. The hint names the token whose value is exactly that color
 *      (whitespace, case and short-hex spelling ignored), else says to add one.
 *  (b) a `px`/`rem` length whose value equals a token of its property's
 *      FAMILY (see LENGTH_FAMILIES below: step/radius/space/shadow by token
 *      prefix) — it names only that family's token(s). Lengths inside at-rule
 *      preludes (`@media (min-width: 40rem)`) are not declarations and are not
 *      read; a length no token of its family holds passes.
 *  (c) a `font-family` literal: one off the system is an error listing the font
 *      tokens; one equal to a token's value is an error naming that token.
 *      `var(…)` and `inherit`/`initial`/`unset`/`revert` pass. The `font`
 *      shorthand is not read (reported as such in the notes).
 * Named colors are not read in properties whose values are identifiers, not
 * paints (`animation`, `transition`, `grid-template-areas`, `content`, …).
 * Text inside strings and `url(…)` is never a color or a length.
 *
 * Suppressions carry a reason and are listed with it: `/* sprig-token: <why> *\/`
 * on the offending line of CSS, `<!-- sprig-token: <why> -->` directly before
 * the element whose `style` it excuses. A suppression with no reason suppresses
 * nothing and is itself an error; one that excuses nothing is a warning.
 */
import { parseTemplate } from "../parse.ts";
import type { Node } from "../node.ts";
import type { Finding } from "./lint-types.ts";
import { collectUiFiles, lineAt, type LintReport } from "./ui-files.ts";

const RULE = "tokens";

/** Every CSS named color, lowercase. */
const NAMED_COLORS = (
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond " +
  "blue blueviolet brown burlywood cadetblue chartreuse chocolate coral " +
  "cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
  "darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid " +
  "darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey " +
  "darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
  "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod " +
  "gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
  "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
  "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon " +
  "lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue " +
  "lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue " +
  "mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen " +
  "mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin " +
  "navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod " +
  "palegreen paleturquoise palevioletred papayawhip peru pink plum powderblue " +
  "purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
  "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow " +
  "springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
  "whitesmoke yellow yellowgreen"
).split(" ");

const NAMED_RE = new RegExp(
  `(?<![-\\w#.])(?:${NAMED_COLORS.join("|")})(?![-\\w(])`,
  "gi",
);
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const COLOR_FN_RE =
  /(?<![-\w])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const LENGTH_RE = /(?<![-\w.#])(-?(?:\d+\.?\d*|\.\d+))(px|rem)(?![\w-])/gi;
/** `prop: value` ending at `;` or `}` — an at-rule prelude ends at `{` and never matches. */
const DECL_RE = /(?<![-\w])(-{0,2}[a-zA-Z][-\w]*)\s*:\s*([^;{}]*)(?=[;}])/g;
const SUPPRESS_RE = /^\s*sprig-token:(.*)$/s;
const WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);
/** Properties whose values are identifiers, never paints. */
const IDENT_PROPS = new Set([
  "animation",
  "animation-name",
  "transition",
  "transition-property",
  "will-change",
  "grid-area",
  "grid-template-areas",
  "grid-row",
  "grid-column",
  "content",
  "counter-reset",
  "counter-increment",
  "counter-set",
  "list-style-type",
  "view-transition-name",
  "container-name",
  "font",
  "font-family",
]);

/**
 * Length families: a `px`/`rem` length is held only to tokens of the family
 * its property belongs to, inferred by token-name prefix. A property in no
 * family (letter-spacing, border-width, …) is never a length finding.
 *
 * | family | properties                                              | token prefixes                    |
 * |--------|---------------------------------------------------------|-----------------------------------|
 * | step   | font-size, line-height                                  | --step, --text, --font-size       |
 * | radius | border-radius, border-*-radius                          | --radius, --rounded               |
 * | space  | gap/row-gap/column-gap, padding*, margin*, inset*, top, | --space, --spacing, --size        |
 * |        | left, right, bottom, width, height, min-/max-width/height |                                 |
 * | shadow | box-shadow                                              | --shadow                          |
 */
const LENGTH_FAMILIES = ["step", "radius", "space", "shadow"] as const;
type Family = typeof LENGTH_FAMILIES[number];
const TOKEN_PREFIXES: Record<Family, string[]> = {
  step: ["--step", "--text", "--font-size"],
  radius: ["--radius", "--rounded"],
  space: ["--space", "--spacing", "--size"],
  shadow: ["--shadow"],
};

function familyOfProp(prop: string): Family | null {
  if (prop === "font-size" || prop === "line-height") return "step";
  if (/^border(-[a-z]+)*-radius$/.test(prop) || prop === "border-radius") {
    return "radius";
  }
  if (prop === "box-shadow") return "shadow";
  if (
    /^(row-|column-)?gap$|^(padding|margin|inset)(-|$)|^(top|left|right|bottom)$|^(min-|max-)?(width|height)$/
      .test(prop)
  ) return "space";
  return null;
}

function familyOfToken(name: string): Family | null {
  for (const f of LENGTH_FAMILIES) {
    if (TOKEN_PREFIXES[f].some((p) => name === p || name.startsWith(p + "-"))) {
      return f;
    }
  }
  return null;
}

/** The notes line: each length family and the app's tokens in it. */
export function describeFamilies(tokens: Tokens): string {
  const parts = LENGTH_FAMILIES.map((f) => {
    const names = Object.keys(tokens).filter((k) => familyOfToken(k) === f)
      .sort();
    return names.length
      ? `${f} ${names.length} (${names.join(", ")})`
      : `${f} 0`;
  });
  const none = parts.every((p) => / 0$/.test(p));
  return `token families: ${parts.join(", ")}${
    none ? " — no length is matched against a token" : ""
  }`;
}

/** Findings + suppressions for one piece of source. */
export type TokenLint = {
  findings: Finding[];
  suppressed: { file: string; line: number; reason: string }[];
};

/** Canonical spelling of a color value for exact-match lookup. */
function normColor(v: string): string {
  const s = v.trim().toLowerCase().replace(/\s+/g, "");
  const hex = /^#([0-9a-f]+)$/.exec(s);
  if (!hex) return s;
  let h = hex[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6);
  return "#" + h;
}

function normLength(n: string, unit: string): string {
  return `${parseFloat(n)}${unit.toLowerCase()}`;
}

function normFont(v: string): string {
  return v.split(",").map((f) =>
    f.trim().replace(/^["']|["']$/g, "").toLowerCase()
  )
    .join(",");
}

/** Token name → its value, or its value in every theme that sets it. */
export type Tokens = Record<string, string | string[]>;

function valuesOf(tokens: Tokens, name: string): string[] {
  const v = tokens[name];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/** Tokens with a value (in any theme) whose normalized form equals `norm`. */
function tokensMatching(
  tokens: Tokens,
  norm: string,
  normalize: (v: string) => string | null,
): string[] {
  return Object.keys(tokens).filter((k) =>
    valuesOf(tokens, k).some((v) => normalize(v) === norm)
  );
}

/**
 * Read a css-variables.json. The build compiles the themed shape
 * `{ default, themes: { <name>: { --token: value, color-scheme } } }`; every
 * theme's `--*` keys are read, so a value matches its token in any theme. A
 * flat `{ --token: value }` map is read too, with a note that the build
 * rejects it (the build, not this lint, owns that error).
 */
export function readTokenFile(
  text: string,
): { tokens: Record<string, string[]>; notes: string[] } {
  const cfg = JSON.parse(text) as Record<string, unknown>;
  const tokens: Record<string, string[]> = {};
  const notes: string[] = [];
  const add = (k: string, v: unknown) => {
    if (!k.startsWith("--")) return;
    const list = tokens[k] ??= [];
    if (!list.includes(String(v))) list.push(String(v));
  };
  const themes = cfg.themes;
  if (themes && typeof themes === "object") {
    for (const theme of Object.values(themes as Record<string, unknown>)) {
      if (!theme || typeof theme !== "object") continue;
      for (const [k, v] of Object.entries(theme)) add(k, v);
    }
  } else {
    notes.push(
      'css-variables.json has no "themes" object — read its top-level --* keys; the build expects { "themes": { … } }',
    );
    for (const [k, v] of Object.entries(cfg)) add(k, v);
  }
  return { tokens, notes };
}

function useHint(names: string[]): string {
  return "use " + names.map((n) => `var(${n})`).join(" or ");
}

/** Blank `[from, to)` of `s` to spaces, keeping newlines (offsets and lines hold). */
function blank(s: string, from: number, to: number): string {
  return s.slice(0, from) + s.slice(from, to).replace(/[^\n]/g, " ") +
    s.slice(to);
}

/** The end (exclusive) of the parenthesized group opening at `open`. */
function closeParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i + 1;
  }
  return s.length;
}

/**
 * Lint one CSS source. `lineOffset` shifts reported lines (a `<style>` block or a
 * `style=""` attribute that starts partway into a template).
 */
export function lintCssText(
  css: string,
  file: string,
  tokens: Tokens,
  lineOffset = 0,
): TokenLint {
  const findings: Finding[] = [];
  const suppressed: TokenLint["suppressed"] = [];
  const reasons = new Map<number, string>(); // line → reason
  const usedReasons = new Set<number>();

  // Pass 1: comments out (recording suppressions), then strings and url(…) out.
  let decls = css;
  for (const m of css.matchAll(/\/\*([\s\S]*?)(?:\*\/|$)/g)) {
    decls = blank(decls, m.index!, m.index! + m[0].length);
    const sup = SUPPRESS_RE.exec(m[1]);
    if (!sup) continue;
    const line = lineAt(css, m.index!) + lineOffset;
    const reason = sup[1].trim();
    if (reason) reasons.set(line, reason);
    else {
      findings.push({
        rule: RULE,
        file,
        line,
        severity: "error",
        message: "sprig-token suppression needs a reason",
        hint: "write /* sprig-token: <why this value is off-token> */",
      });
    }
  }
  let paints = decls;
  for (const m of decls.matchAll(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g)) {
    paints = blank(paints, m.index! + 1, m.index! + m[0].length - 1);
  }
  for (const m of paints.matchAll(/(?<![-\w])url\(/gi)) {
    paints = blank(paints, m.index! + 4, closeParen(paints, m.index! + 3) - 1);
  }

  // A var() fallback that restates that token's own value is the token.
  for (const m of paints.matchAll(/(?<![-\w])var\(\s*(--[\w-]+)\s*,/g)) {
    const from = m.index! + m[0].length;
    const to = closeParen(paints, m.index! + 3) - 1;
    const canon = (v: string) => {
      const t = /^\s*(-?(?:\d+\.?\d*|\.\d+))(px|rem)\s*$/i.exec(v);
      return t ? normLength(t[1], t[2]) : normColor(v);
    };
    const fallback = canon(paints.slice(from, to));
    if (valuesOf(tokens, m[1]).some((v) => canon(v) === fallback)) {
      paints = blank(paints, from, to);
    }
  }

  const report = (index: number, message: string, hint: string) => {
    const line = lineAt(css, index) + lineOffset;
    const reason = reasons.get(line);
    if (reason !== undefined) {
      usedReasons.add(line);
      if (!suppressed.some((s) => s.line === line)) {
        suppressed.push({ file, line, reason });
      }
      return;
    }
    const col = index - css.lastIndexOf("\n", index - 1);
    findings.push({
      rule: RULE,
      file,
      line,
      col,
      message,
      hint,
      severity: "error",
    });
  };

  for (const d of decls.matchAll(DECL_RE)) {
    const prop = d[1].toLowerCase();
    const vStart = d.index! + d[0].length - d[2].length;
    const raw = d[2];
    const value = paints.slice(vStart, vStart + raw.length);

    if (prop === "font-family") {
      const lit = raw.trim();
      if (lit.includes("var(") || WIDE_KEYWORDS.has(lit.toLowerCase())) {
        continue;
      }
      const same = tokensMatching(tokens, normFont(lit), normFont);
      if (same.length) {
        report(
          vStart,
          `font-family ${lit} is the value of ${same.join(", ")}`,
          useHint(same),
        );
      } else {
        const fonts = Object.keys(tokens).filter((k) =>
          /font|family/.test(k) &&
          !/size|weight|feature|variation|height/.test(k)
        );
        report(
          vStart,
          `off-system font: font-family ${lit}`,
          fonts.length
            ? `${useHint(fonts)}, or add the font to css-variables.json`
            : "add it to css-variables.json as --font-<role> and use var(--font-<role>)",
        );
      }
      continue;
    }

    const hits: { at: number; lit: string }[] = [];
    for (const m of value.matchAll(HEX_RE)) {
      hits.push({ at: m.index!, lit: m[0] });
    }
    for (const m of value.matchAll(COLOR_FN_RE)) {
      const end = closeParen(value, m.index! + m[0].length - 1);
      const lit = raw.slice(m.index!, end);
      if (!lit.includes("var(")) hits.push({ at: m.index!, lit });
    }
    if (!IDENT_PROPS.has(prop)) {
      for (const m of value.matchAll(NAMED_RE)) {
        hits.push({ at: m.index!, lit: m[0] });
      }
    }
    // a hex or a name nested inside a reported color function is reported once, as the function
    const fns = hits.filter((h) => h.lit.includes("("));
    const colors = hits.filter((h) =>
      h.lit.includes("(") ||
      !fns.some((f) => h.at > f.at && h.at < f.at + f.lit.length)
    ).sort((a, b) => a.at - b.at);
    for (const h of colors) {
      const same = tokensMatching(tokens, normColor(h.lit), normColor);
      report(
        vStart + h.at,
        `raw color ${h.lit} in ${prop}`,
        same.length
          ? useHint(same)
          : "add it to css-variables.json and use var(--…)",
      );
    }

    const family = familyOfProp(prop);
    for (const m of family ? value.matchAll(LENGTH_RE) : []) {
      const norm = normLength(m[1], m[2]);
      const inFamily = Object.fromEntries(
        Object.entries(tokens).filter(([k]) => familyOfToken(k) === family),
      );
      const same = tokensMatching(inFamily, norm, (v) => {
        const t = /^\s*(-?(?:\d+\.?\d*|\.\d+))(px|rem)\s*$/i.exec(v);
        return t ? normLength(t[1], t[2]) : null;
      });
      if (same.length) {
        report(
          vStart + m.index!,
          `length ${m[0]} in ${prop} is the value of ${same.join(", ")}`,
          useHint(same),
        );
      }
    }
  }

  for (const [line, reason] of reasons) {
    if (usedReasons.has(line)) continue;
    findings.push({
      rule: RULE,
      file,
      line,
      severity: "warn",
      message:
        `sprig-token suppression excuses nothing on this line (${reason})`,
      hint: "delete the comment, or move it onto the line it excuses",
    });
  }
  findings.sort((a, b) => a.line - b.line || (a.col ?? 0) - (b.col ?? 0));
  return { findings, suppressed };
}

function childOfType(node: Node, type: string): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

/** The `sprig-token` reason on the comment directly before `el`, if any. */
function precedingSuppression(
  el: Node,
): { reason: string; line: number } | null {
  let prev = el.previousNamedSibling;
  while (prev && prev.type === "text" && prev.text.trim() === "") {
    prev = prev.previousNamedSibling;
  }
  if (!prev || prev.type !== "comment") return null;
  const m = /^<!--\s*sprig-token:([\s\S]*?)-->$/.exec(prev.text);
  return m ? { reason: m[1].trim(), line: prev.startPosition.row + 1 } : null;
}

/** Lint every `style="…"` attribute and `<style>` block in one template. */
export async function lintTemplateStyles(
  html: string,
  file: string,
  tokens: Tokens,
): Promise<TokenLint> {
  const out: TokenLint = { findings: [], suppressed: [] };
  const root = await parseTemplate(html, { allowError: true });
  const visit = (node: Node) => {
    if (node.type === "style_element") {
      const raw = childOfType(node, "raw_text");
      if (raw) {
        const r = lintCssText(raw.text, file, tokens, raw.startPosition.row);
        out.findings.push(...r.findings);
        out.suppressed.push(...r.suppressed);
      }
    }
    if (node.type === "attribute") {
      const name = childOfType(node, "attribute_name");
      const quoted = childOfType(node, "quoted_value");
      if (name?.text.toLowerCase() === "style" && quoted) {
        const value = quoted.text.slice(1, -1);
        const r = lintCssText(
          `*{${value}}`,
          file,
          tokens,
          quoted.startPosition.row,
        );
        const holder = node.parent.type === "start_tag"
          ? node.parent.parent
          : node.parent;
        const sup = precedingSuppression(holder);
        const line = node.startPosition.row + 1;
        if (
          sup && sup.reason && r.findings.some((f) => f.severity === "error")
        ) {
          out.suppressed.push({ file, line, reason: sup.reason });
          r.findings = r.findings.filter((f) => f.severity !== "error");
        } else if (sup && !sup.reason) {
          out.findings.push({
            rule: RULE,
            file,
            line: sup.line,
            severity: "error",
            message: "sprig-token suppression needs a reason",
            hint: "write <!-- sprig-token: <why this value is off-token> -->",
          });
        } else if (sup) {
          out.findings.push({
            rule: RULE,
            file,
            line: sup.line,
            severity: "warn",
            message:
              `sprig-token suppression excuses nothing on the next element (${sup.reason})`,
            hint: "delete the comment",
          });
        }
        out.findings.push(...r.findings.map(({ col: _col, ...f }) => f));
        out.suppressed.push(...r.suppressed);
      }
    }
    for (let i = 0; i < node.namedChildCount; i++) visit(node.namedChild(i));
  };
  visit(root);
  out.findings.sort((a, b) => a.line - b.line);
  return out;
}

/** Lint an app's `ui/src` against its `css-variables.json`. Pure: reads files, never exits. */
export async function lintTokens(opts: { uiSrc: string }): Promise<LintReport> {
  const tokensPath = `${opts.uiSrc.replace(/\/$/, "")}/css-variables.json`;
  let text: string;
  try {
    text = await Deno.readTextFile(tokensPath);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    return {
      findings: [],
      suppressed: [],
      checked: [],
      notes: [],
      skipped:
        `no ${tokensPath} — the app declares no design tokens, so there is nothing to hold its styles to`,
    };
  }
  const report: LintReport = {
    findings: [],
    suppressed: [],
    checked: [tokensPath],
    notes: [],
  };
  let tokens: Record<string, string[]>;
  try {
    const read = readTokenFile(text);
    tokens = read.tokens;
    report.notes.push(...read.notes);
  } catch (e) {
    report.findings.push({
      rule: RULE,
      file: tokensPath,
      line: 1,
      severity: "error",
      message: `css-variables.json is not JSON: ${(e as Error).message}`,
      hint:
        'fix the JSON — it must be { "default": …, "themes": { <name>: { --token: value } } }',
    });
    return report;
  }
  const files = await collectUiFiles(opts.uiSrc);
  report.notes.push(describeFamilies(tokens));
  report.notes.push(...files.notes);
  report.notes.push(
    "not read: the font shorthand (only font-family is held to the font tokens)",
  );
  for (const path of files.styles) {
    const r = lintCssText(await Deno.readTextFile(path), path, tokens);
    report.checked.push(path);
    report.findings.push(...r.findings);
    report.suppressed.push(...r.suppressed);
  }
  for (const path of files.templates) {
    const r = await lintTemplateStyles(
      await Deno.readTextFile(path),
      path,
      tokens,
    );
    report.checked.push(path);
    report.findings.push(...r.findings);
    report.suppressed.push(...r.suppressed);
  }
  return report;
}
