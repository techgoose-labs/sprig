import { assert, assertEquals } from "@std/assert";
import { checkLogicSource } from "./logic-placement.ts";

const rules = (src: string, handlers: string[] = []) =>
  checkLogicSource(src, "logic.ts", { handlers }).findings.map((f) =>
    `${f.rule}@${f.line}`
  );
const clean = (src: string, handlers: string[] = []) =>
  assertEquals(rules(src, handlers), [], src);
const flags = (src: string, rule: string, handlers: string[] = []) =>
  assertEquals(
    rules(src, handlers).map((r) => r.split("@")[0]),
    [rule],
    src,
  );

Deno.test("REQ-023: (a) data × data arithmetic is business logic", () => {
  flags(`const t = this.price() * this.qty();`, "logic-placement/a");
  flags(`const t = price * qty;`, "logic-placement/a");
  flags(`const t = order.subtotal + order.shipping;`, "logic-placement/a");
  flags(`const t = a.b[i] - c.d;`, "logic-placement/a");
  flags(`const r = amount % order.split;`, "logic-placement/a");
  flags(`sum += item.price;`, "logic-placement/a");
  flags(`total -= line.discount;`, "logic-placement/a");
});

Deno.test("REQ-023: (a) a member × a numeric literal other than 0 or 1 is a rate/tax/threshold", () => {
  flags(`const tax = order.subtotal * 0.2;`, "logic-placement/a");
  flags(`const t = 100 * this.rate();`, "logic-placement/a");
  flags(`x.total *= 1.15;`, "logic-placement/a");
  clean(`const n = this.page() + 1;`);
  clean(`const n = this.page() - 1;`);
  clean(`const z = item.value * 0;`);
  clean(`const s = price * 2;`); // identifier × literal: not a member expression
  clean(`i++; n--; const neg = -x.y;`);
});

Deno.test("REQ-023: (a) UI geometry is exempt — event/e/window/document/el/this.el/rect/Math/Date roots", () => {
  clean(`const dx = event.clientX - start.x;`);
  clean(`const dy = e.pageY * scale.factor;`);
  clean(`const w = window.innerWidth / cols.n;`);
  clean(`const h = document.body.scrollHeight - vp.h;`);
  clean(`const a = el.foo * box.bar;`);
  clean(`const a = this.el.foo * box.bar;`);
  clean(`const mid = rect.foo / 2 + pad.p;`);
  clean(`const r = Math.round(x) * y.z; const p = Math.PI * r.r;`);
  clean(`const age = Date.now() - this.at();`);
});

Deno.test("REQ-023: (a) UI geometry is exempt — names ending in Width|Height|Top|Left|X|Y|Index|Count|Length|Offset|Scroll", () => {
  for (
    const n of [
      "colWidth",
      "rowHeight",
      "cardTop",
      "boxLeft",
      "originX",
      "originY",
      "activeIndex",
      "pageCount",
      "listLength",
      "dragOffset",
      "maxScroll",
    ]
  ) clean(`const v = this.${n}() * grid.cells;`);
  clean(`const pct = this.items().length * 3;`);
  clean(`const w = box.width * 2 + box.height;`);
});

Deno.test("REQ-023: (a) strings, calls with arguments and TS generics are not arithmetic", () => {
  clean(`const s = "Hello " + user.name;`);
  clean("const s = `${a}` + b.c;");
  clean(
    `const v = signal<Res[]>([]); const m = new Map<string, Array<number>>();`,
  );
  clean(`const n = Number(a.b) * Number(c.d);`);
  clean(`// order.subtotal * order.tax in a comment`);
});

Deno.test("REQ-023: (b) a data-vs-data relational comparison in if / while / ternary / && / || is domain branching", () => {
  flags(`if (order.total > customer.limit) warn();`, "logic-placement/b");
  flags(
    `const c = this.balance() < this.minimum() ? "red" : "ok";`,
    "logic-placement/b",
  );
  flags(`const ok = a.age >= b.minAge && go();`, "logic-placement/b");
  flags(
    `const ok = ready || this.stock() >= this.wanted();`,
    "logic-placement/b",
  );
  flags(`while (spent <= budget) spent++;`, "logic-placement/b");
  flags(`if ((x.a >= y.b)) f();`, "logic-placement/b");
});

Deno.test("REQ-023 AMENDMENT: (b) data-vs-data equality is identity/selection, not a domain rule", () => {
  clean(`const ok = a.role === b.required && go();`);
  clean(`if ((x.a !== y.b)) f();`);
  clean(`if (route !== active()) f();`);
  clean(`const hit = list.find((x) => x.key === c.key && x.scope == c.scope);`);
  clean(`if (a.id != b.id) f();`);
  clean(`switch (order.tier) {\n  case customer.tier: grant(); break;\n}`);
});

Deno.test("REQ-023: (b) comparisons to literals, null, undefined, .length, booleans and constants are state switching", () => {
  clean(`if (this.status() === "loading") f();`);
  clean(`if (x.y == null || x.z === undefined) f();`);
  clean(`if (this.items().length > 0) f();`);
  clean(`if (a.length === b.length) f();`);
  clean(`if (this.open() === true) f();`);
  clean(`if (this.tab() === Tab.Orders) f();`);
  clean(`if (mode === MAX_MODE) f();`);
  clean(`if (typeof v === "string") f();`);
  clean(`switch (this.view()) { case "grid": break; }`);
  clean(`const same = a.b === c.d;`); // not a branch
  clean(`if (e.key === this.hotkey()) f();`);
  clean(`if (i === this.activeIndex()) f();`);
});

Deno.test("REQ-023: (c) .test( / .match( / RegExp are validation beyond required/type", () => {
  flags(`const ok = /^[^@]+@[^@]+$/.test(this.email());`, "logic-placement/c");
  flags(`const m = this.zip().match(ZIP);`, "logic-placement/c");
  flags(`const re = new RegExp(pattern);`, "logic-placement/c");
  clean(`const s = this.name().replace(/\\s+/g, " ");`);
  clean(
    `if (!value) f(); if (value === "") f(); if (typeof n !== "number") f(); if (Number.isNaN(n)) f();`,
  );
});

Deno.test("REQ-023: (c) .length compared to a literal > 1 inside an event handler is validation", () => {
  const src = [
    `export default defineComponent({ setup: () => {`,
    `  const name = signal("");`,
    `  const submit = () => {`,
    `    if (name().length < 3) return;`,
    `  };`,
    `  const summary = () => name().length > 40;`,
    `  return { name, submit, summary };`,
    `}});`,
  ].join("\n");
  assertEquals(rules(src, ["submit"]), ["logic-placement/c@4"]);
  assertEquals(rules(src, []), []);
  assertEquals(
    rules(
      `class C {\n  onSave(): void {\n    if (this.pin().length !== 4) return;\n  }\n  onBrowserInit() { if (this.pin().length !== 4) return; }\n}`,
    ),
    ["logic-placement/c@3"],
  );
  assertEquals(
    rules(
      `el.addEventListener("input", (ev) => {\n  if (ev.target.value.length >= 8) ok();\n});`,
    ),
    ["logic-placement/c@2"],
  );
  assertEquals(
    rules(
      `const onKey = (e: KeyboardEvent) => { if (q.length > 1) go(); if (q.length > 0) go(); };`,
    ),
    [],
  );
});

Deno.test("REQ-023: (d) calling or defining validate/compute/calculate/derive/total/price/discount/tax/eligib/score/rank/allocate/schedule", () => {
  flags(`function calculateTax(x: number) { return x; }`, "logic-placement/d");
  flags(`const r = validateEmail(this.email());`, "logic-placement/d");
  flags(`const d = svc.discountFor(o);`, "logic-placement/d");
  flags(
    `class C {\n  priceFor(item: Item): number { return item.cents; }\n}`,
    "logic-placement/d",
  );
  flags(`const scoreCard = (c: Card) => c.points;`, "logic-placement/d");
  flags(`const total = computed(() => items());`, "logic-placement/d");
  flags(
    `const o = { isEligible: 1, eligibility: function () { return 1; } };`,
    "logic-placement/d",
  );
  flags(`rankResults();`, "logic-placement/d");
  clean(`const price = signal(0); const p = price(); const t = this.total();`);
  clean(`const c = computed(() => this.items());`);
  clean(`import { scheduleThing } from "./x.ts";`);
});

Deno.test("REQ-023: messages name the rule letter and point the work at the backend", () => {
  const [a] = checkLogicSource(`const t = o.price * o.qty;`, "l.ts").findings;
  assert(a.message.startsWith("(a) "), a.message);
  assert(a.message.includes("this is a query the backend should answer"));
  assert(a.message.includes("o.price * o.qty"), a.message);
  assertEquals([a.severity, a.line, a.col], ["error", 1, 11]);
  const [c] = checkLogicSource(`const ok = RE.test(v);`, "l.ts").findings;
  assert(c.message.startsWith("(c) "));
  assert(
    c.message.includes(
      "validate in the backend; the client checks required/type only",
    ),
  );
  assert(a.hint.includes("// sprig-logic: <reason>"));
});

Deno.test("REQ-023: `// sprig-logic: <reason>` suppresses, listed and counted with its reason", () => {
  const src = [
    `const t = o.price * o.qty; // sprig-logic: display-only preview, backend recomputes`,
    `// sprig-logic: chart scale`,
    `const k = series.max / axis.ticks;`,
    `const u = o.price * o.qty;`,
  ].join("\n");
  const r = checkLogicSource(src, "l.ts");
  assertEquals(r.findings.map((f) => f.line), [4]);
  assertEquals(r.suppressed, [
    {
      file: "l.ts",
      line: 1,
      reason: "display-only preview, backend recomputes",
    },
    { file: "l.ts", line: 3, reason: "chart scale" },
  ]);
});
