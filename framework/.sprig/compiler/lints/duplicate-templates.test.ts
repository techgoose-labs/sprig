// REQ-028 — the duplicate-templates lint: structural normalization and the
// deterministic similarity, over in-memory strings.
import { assert, assertEquals } from "@std/assert";
import {
  bindingsOf,
  containment,
  featuresOf,
  jaccard,
  roleOf,
  structureOf,
  treeOf,
} from "./duplicate-templates.ts";
import { parseTemplate } from "../parse.ts";

const CARD_A = `<article class="card">
  <header class="card__head"><h3>{{ title }}</h3><span class="badge">{{ tag }}</span></header>
  <p class="card__body">{{ body }}</p>
  @if (cta) { <button class="btn" (click)="go()">Go</button> }
</article>`;
const CARD_B = `<article class="tile">
  <header class="tile__head"><h3>Other words entirely</h3><span class="pill">{{ label }}</span></header>
  <p class="tile__body">Lorem ipsum</p>
  @if (action) { <button class="btn btn-primary" (click)="run()">Run</button> }
</article>`;
const TABLE = `<table class="t">
  <thead><tr><th>Name</th><th>Qty</th></tr></thead>
  <tbody>@for (r of rows; track r.id) { <tr><td>{{ r.name }}</td><td [title]="r.qty">{{ r.qty }}</td></tr> }</tbody>
</table>`;

Deno.test("REQ-028: text and attribute values never reach the structure", async () => {
  const a = await structureOf(CARD_A);
  const b = await structureOf(CARD_B);
  assertEquals([...a.shingles].sort(), [...b.shingles].sort());
  assertEquals(jaccard(a.shingles, b.shingles), 1);
});

Deno.test("REQ-028: tag names, attribute names and control flow are the structure", async () => {
  const s = await structureOf(CARD_A);
  const all = [...s.shingles].join("\n");
  for (
    const want of [
      "article",
      "header",
      "h3",
      "[class]",
      "(click)",
      "@if",
      "button",
    ]
  ) {
    assert(all.includes(want), `missing ${want} in\n${all}`);
  }
  assert(!all.includes("card__head"), "an attribute value leaked");
  assert(!all.includes("title"), "an interpolation leaked");
});

Deno.test("REQ-028: sprig wiring verbs and bindings keep their names", async () => {
  const s = await structureOf(
    `<div sets:org={x} reads:y [a]="b" *ngIf="z"><i></i><b></b><u></u></div>`,
  );
  const all = [...s.shingles].join("\n");
  for (const want of ["[sets:org]", "[reads:y]", "[[a]]", "[*ngIf]"]) {
    assert(all.includes(want), `missing ${want} in\n${all}`);
  }
});

Deno.test("REQ-028: unrelated templates score low; similarity is symmetric", async () => {
  const a = await structureOf(CARD_A);
  const t = await structureOf(TABLE);
  const ab = jaccard(a.shingles, t.shingles);
  assert(ab < 0.3, `card vs table scored ${ab}`);
  assertEquals(ab, jaccard(t.shingles, a.shingles));
});

Deno.test("REQ-028: one extra footer lowers the score measurably but not to unrelated", async () => {
  const a = await structureOf(CARD_A);
  const plus = await structureOf(
    CARD_A.replace("</article>", "<footer><small>x</small></footer></article>"),
  );
  const s = jaccard(a.shingles, plus.shingles);
  assert(s < 1 && s > 0.6, `scored ${s}`);
});

Deno.test("REQ-028: node count counts elements and control flow, not attributes or text", async () => {
  const s = await structureOf(`<span class="x" id="y">{{ a }}</span>`);
  assertEquals(s.nodes, 1);
  assertEquals((await structureOf(CARD_A)).nodes, 7);
});

Deno.test("REQ-028: a sprig-duplicate comment is read as a justification with its reason and line", async () => {
  const s = await structureOf(
    `<div>\n<!-- sprig-duplicate: the admin variant diverges next sprint -->\n<i></i></div>`,
  );
  assertEquals(s.justification, {
    line: 2,
    reason: "the admin variant diverges next sprint",
  });
  const empty = await structureOf(`<!-- sprig-duplicate: -->\n<div></div>`);
  assertEquals(empty.justification, { line: 1, reason: "" });
  assertEquals((await structureOf(`<div></div>`)).justification, undefined);
});

Deno.test("REQ-028: jaccard of two empty sets is 0, not NaN", () => {
  assertEquals(jaccard(new Set(), new Set()), 0);
});

// ─── REQ-069: containment features, bindings, role ───────────────────────────

const BADGE =
  `<span class="badge badge-soft status-badge-label" [class.badge-success]="ok">
  @if (icon) { <svg class="size-4"><path d="M1 1"></path></svg> }
  {{ label }}
</span>`;

Deno.test("REQ-069: features are tag paths and tag.class tokens; control flow is transparent, svg a leaf", async () => {
  const f = featuresOf(await treeOf(BADGE), "status-badge");
  assertEquals([...f.required].sort(), [
    "^/span",
    "^/span/svg",
    "span.badge",
    "span.badge-soft",
    "svg.size-4",
  ]);
  assertEquals(f.classes, 3);
});

Deno.test("REQ-069: a unit's own <selector>-… classes and [class.x] variants are never required of a copy", async () => {
  const f = featuresOf(
    await treeOf(BADGE.replace("status-badge-label", "badge-label-x")),
    "badge-label",
  );
  assert(f.required.has("span.badge"));
  assert(!f.required.has("span.badge-label-x"), [...f.required].join(" "));
  assert(!f.required.has("span.badge-success"));
  assert(
    f.all.has("span.badge-success"),
    "a variant still counts when a copy hard-codes it",
  );
});

Deno.test("REQ-069: containment is |A ∩ B| / |A| — asymmetric, and 0 for an empty A", () => {
  const small = new Set(["a", "b"]);
  const big = new Set(["a", "b", "c", "d"]);
  assertEquals(containment(small, big), 1);
  assertEquals(containment(big, small), 0.5);
  assertEquals(containment(new Set(), big), 0);
});

Deno.test("REQ-069: bindings are the free names a template reads, and the names its handlers call", async () => {
  const b = bindingsOf(
    await parseTemplate(
      `@let total = order.lines.length;
<div [class.on]="active" (click)="pick(order.id)" (keydown)="$event && pick(order.id)">
  @for (l of order.lines; track l.id) {<p [title]="l.sku">{{ l.qty | number }} {{ total }}</p>}
  {{ note ? note : null }}
  <button (submit)="save()">{{ label() }}</button>
</div>`,
      { allowError: true },
    ),
  );
  assertEquals([...b.reads].sort(), ["active", "label", "note", "order"]);
  assertEquals([...b.handlers].sort(), ["pick", "save"]);
  assert(
    !b.reads.has("pick"),
    "a handler is what a template does, not what it shows",
  );
  assert(!b.reads.has("number"), "a pipe name is not a binding");
  assert(
    !b.reads.has("l") && !b.reads.has("total"),
    "@for / @let locals are not inputs",
  );
});

Deno.test("REQ-069: a template's role is its root's daisyUI component (own classes skipped), else its tag", async () => {
  assertEquals(roleOf(await treeOf(`<li class="list-row x">a</li>`)), "list");
  assertEquals(
    roleOf(await treeOf(`<article class="grid card">a</article>`)),
    "card",
  );
  assertEquals(
    roleOf(
      await treeOf(`<section class="status-strip-grid grid">a</section>`),
      "status-strip",
    ),
    "section",
  );
  assertEquals(
    roleOf(await treeOf(`<svg></svg><dialog class="modal"></dialog>`)),
    "modal",
  );
});
