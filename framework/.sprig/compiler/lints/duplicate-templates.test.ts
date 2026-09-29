// REQ-028 — the duplicate-templates lint: structural normalization and the
// deterministic similarity, over in-memory strings.
import { assert, assertEquals } from "@std/assert";
import { jaccard, structureOf } from "./duplicate-templates.ts";

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
