// REQ-001 — a double-quoted string literal in an expression.
//
// The grammar's `string` token is single-quoted only (`/'([^'\\]|\\.)*'/`): inside
// a "-delimited attribute value a double-quoted literal is ambiguous with the
// closing delimiter, so the grammar never learned the form
// (tree-sitter-angular-template/README.md, "Known limitations").
//
// But in TEXT position — a `{{ … }}` interpolation, an `@if (…)`/`@case (…)` block
// header — there is no attribute delimiter to collide with, and `"x"` is what
// everyone writes (sprig's own two workbench templates did, and took `sprig dev`
// down with them). So parse.ts normalizes those two contexts to the single-quoted
// form BEFORE the grammar sees them, next to the loose-`@` and wiring-longhand
// pre-passes that already do this kind of work.
//
// Where it is still unsupported — inside an attribute value, where `"` really is
// the delimiter — the error must NAME the cause.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { named, parseTemplate, singleQuoteExprStrings } from "./parse.ts";
import type { Scope } from "./expr.ts";
import { renderNodes } from "./render.ts";

async function render(src: string, scope: Scope): Promise<string> {
  const root = await parseTemplate(src);
  return await renderNodes(named(root), {
    scope,
    registry: { get: () => undefined },
    source: root.text,
    // deno-lint-ignore no-explicit-any
  } as any);
}

Deno.test("REQ-001: a double-quoted literal in {{ }} parses and renders", async () => {
  const out = await render(
    `<span>{{ status() === "running" ? "running…" : "▸ run" }}</span>`,
    { status: () => "running" },
  );
  assertStringIncludes(out, "running…");
});

Deno.test("REQ-001: the exact line that broke the workbench parses", async () => {
  const src =
    `<button type="button" class="iso-run__btn" (click)="run()" [disabled]="status() === 'running'">\n` +
    `  {{ status() === "running" ? "running…" : "▸ run" }}\n</button>`;
  const root = await parseTemplate(src);
  assertEquals(root.hasError, false);
});

Deno.test("REQ-001: a double-quoted literal in a block header parses", async () => {
  for (
    const src of [
      `@if (mode() === "edit") {<b>edit</b>}`,
      `@switch (mode()) { @case ("edit") {<b>edit</b>} @default {<i>view</i>} }`,
      `@for (r of rows(); track r.id) {<span>{{ r.kind === "ok" ? "✓" : "✗" }}</span>}`,
    ]
  ) {
    const root = await parseTemplate(src);
    assertEquals(root.hasError, false, `failed to parse: ${src}`);
  }
});

Deno.test("REQ-001: a block header's double-quoted literal keeps its VALUE", async () => {
  assertEquals(
    await render(`@if (mode() === "edit") {<b>yes</b>} @else {<i>no</i>}`, {
      mode: () => "edit",
    }),
    "<b>yes</b>",
  );
});

Deno.test("REQ-001: normalization is value-preserving, not just parse-preserving", async () => {
  // an apostrophe inside a double-quoted literal must survive the rewrite to '…'
  const out = await render(`<span>{{ "it's fine" }}</span>`, {});
  assertStringIncludes(out, "it's fine");
  // a double quote inside a SINGLE-quoted literal is content, not a delimiter
  const out2 = await render(`<span>{{ 'he said "hi"' }}</span>`, {});
  assertStringIncludes(out2, 'he said "hi"');
});

Deno.test("REQ-001: normalization leaves non-expression text alone", () => {
  for (
    const src of [
      `<div class="card" title="a b">x</div>`, // attribute delimiters
      `<div title="{{ label() }}">x</div>`, // interpolation INSIDE an attribute
      `<!-- a "quoted" comment -->`,
      `<script>const a = "keep me";</script>`,
      `<style>.a::after{content:"x"}</style>`,
      `<p>She said "hello" to him.</p>`, // prose, not an expression
    ]
  ) {
    assertEquals(singleQuoteExprStrings(src), src, `rewrote: ${src}`);
  }
});

Deno.test("REQ-001: an unsupported double-quoted literal names the cause", async () => {
  // Inside a "-delimited attribute value the `"` IS the delimiter — unfixable
  // without context-split expression rules, so the error must at least teach it.
  const err = await parseTemplate(`<b [title]='a === "x"'>hi</b>`).then(
    () => null,
    (e: Error) => e,
  );
  assert(err, "expected a parse error");
  assertStringIncludes(err.message, "double-quoted string literal");
  assertStringIncludes(err.message, "single-quoted");
});

Deno.test("REQ-001: an ordinary syntax error does NOT blame double quotes", async () => {
  const err = await parseTemplate(`@if (a) {<b>unclosed`).then(
    () => null,
    (e: Error) => e,
  );
  assert(err, "expected a parse error");
  assertEquals(err.message.includes("double-quoted"), false, err.message);
});

Deno.test("REQ-001: the expression evaluator unquotes a rewritten literal", async () => {
  const root = await parseTemplate(`<span>{{ "a\\"b" }}</span>`);
  assertEquals(root.hasError, false);
  const out = await render(`<span>{{ "a'b" }}</span>`, {});
  assertStringIncludes(out, "a'b");
});
