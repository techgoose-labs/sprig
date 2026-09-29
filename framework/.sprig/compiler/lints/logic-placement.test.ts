import { assert, assertEquals } from "@std/assert";
import { checkLogicSource, checkTemplateLogic } from "./logic-placement.ts";

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
  clean(`const ok = a.kind === b.required && go();`); // REQ-050: a `role` is (e)
  clean(`if ((x.a !== y.b)) f();`);
  clean(`if (route !== active()) f();`);
  clean(`const hit = list.find((x) => x.key === c.key && x.scope == c.scope);`);
  clean(`if (a.id != b.id) f();`);
  clean(`switch (order.kind) {\n  case customer.kind: grant(); break;\n}`);
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
      `class C {\n  onSave(): void {\n    if (this.pin().length < 4) return;\n  }\n  onBrowserInit() { if (this.pin().length < 4) return; }\n}`,
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
  // REQ-065: a (d)-named DEFINITION is flagged when its body does work — the
  // passthrough forms of these same definitions are clean (next test)
  flags(
    `function calculateTax(x: number) { return round(x); }`,
    "logic-placement/d",
  );
  flags(`const r = validateEmail(this.email());`, "logic-placement/d");
  flags(`const d = svc.discountFor(o);`, "logic-placement/d");
  flags(
    `class C {\n  priceFor(item: Item): number { return LIST[item.sku]; }\n}`,
    "logic-placement/d",
  );
  flags(
    `const scoreCard = (c: Card) => c.points.reduce(sum);`,
    "logic-placement/d",
  );
  flags(
    `const total = computed(() => items().map(cents));`,
    "logic-placement/d",
  );
  flags(
    `const o = { isEligible: 1, eligibility: function () { if (a) return 1; } };`,
    "logic-placement/d",
  );
  flags(`rankResults();`, "logic-placement/d");
  clean(`const price = signal(0); const p = price(); const t = this.total();`);
  clean(`const c = computed(() => this.items());`);
  clean(`import { scheduleThing } from "./x.ts";`);
});

Deno.test("REQ-065: (d) a domain-named accessor that only reads or formats a field passes", () => {
  clean(`function calculateTax(x: number) { return x; }`);
  clean(
    `class C {\n  priceFor(item: Item): number { return item.cents; }\n}`,
  );
  clean(`const scoreCard = (c: Card) => c.points;`);
  clean(`const total = computed(() => items());`);
  clean(`const o = { eligibility: function () { return 1; } };`);
  clean(
    `class D {\n  total(): number {\n    return this.day()?.kennelsTotal ?? this.kennelsTotal();\n  }\n  get totalDogs() { return this.day()?.dogs; }\n  totalLabel(): string { return USD.format(this.day()?.revenue ?? 0); }\n  view() { return this.total() + " kennels"; }\n}`,
  );
  // … and the same names doing work are still (d): arithmetic, a comparison,
  // a branch, a lookup, a non-formatter call
  assertEquals(
    rules(`class D {\n  total() { return this.a() + this.b(); }\n}`),
    ["logic-placement/d@2", "logic-placement/a@2"],
  );
  flags(
    `class D {\n  priceOk() { return this.p() === this.q(); }\n}`,
    "logic-placement/d",
  );
  flags(
    `class D {\n  total() { if (this.x()) return 1; return 2; }\n}`,
    "logic-placement/d",
  );
  flags(
    `class D {\n  price() { return PRICES[this.sku()]; }\n}`,
    "logic-placement/d",
  );
  flags(
    `class D {\n  total() { return sum(this.lines()); }\n}`,
    "logic-placement/d",
  );
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

Deno.test("REQ-050: (a) a money-named signal read × a literal is a rate; ×/÷ 10|100|1000 inside .format( is units", () => {
  flags(`const t = subtotal() * 0.0825;`, "logic-placement/a");
  flags(`const r = Math.round(amount() * 100) / 100;`, "logic-placement/a");
  clean(`const z = zoom() * 1.25; const p = current() * 100;`);
  clean(`const s = price * 2;`); // a bare identifier stays clean
  clean(`const s = fmt.format(quote().totalCents / 100);`);
  flags(`const s = fmt.format(quote().totalCents * 1.2);`, "logic-placement/a");
  flags(`const s = fmt.format(o.price * o.qty);`, "logic-placement/a");
});

Deno.test("REQ-050: (a)(d) ev/evt/performance roots, `now` and geometry-named definitions are UI", () => {
  clean(`const p = ev.loaded / ev.total * 100;`);
  clean(`const d = evt.detail.a - evt.detail.b;`);
  clean(`const t = performance.now() - start.at; if (now - last < 100) f();`);
  clean(`const totalHeight = computed(() => rows().length * ROW);`);
  flags(
    `const totalCost = computed(() => sumOf(rows()));`,
    "logic-placement/d",
  );
});

Deno.test("REQ-050: (b) a member vs a literal other than 0/±1 or an ALL_CAPS constant, in a branch, is a threshold", () => {
  flags(`const ok = a.age >= 18 && go();`, "logic-placement/b");
  flags(`const s = cart().subtotal >= 50 ? 0 : 4.99;`, "logic-placement/b");
  flags(`if (l.days > STALE_DAYS) f();`, "logic-placement/b");
  clean(`if (x.n > 0 || x.m < 1 || x.k > -1) f();`);
  clean(`if (e.clientY > 200 || this.rowHeight > 40) f();`);
  clean(`if (remaining() < 20) f();`); // a local, not a member
  clean(`const big = a.age >= 18;`); // not a branch
});

Deno.test("REQ-050: (b) the wall clock vs data, and a .length vs a data limit", () => {
  flags(
    `const late = Date.now() > Date.parse(inv.dueAt);`,
    "logic-placement/b",
  );
  flags(
    `const live = computed(() => new Date() >= SALE);`,
    "logic-placement/b",
  );
  flags(`if (due < Date.now()) f();`, "logic-placement/b");
  clean(`if (Date.now() - last < 100) return;`);
  clean(`const age = Date.now() - this.at();`);
  flags(
    `const x = team.members.length >= team.maxSeats ? "full" : "";`,
    "logic-placement/b",
  );
  clean(
    `const x = i < rows().length ? 1 : 2; const y = a.length === b.length;`,
  );
});

Deno.test("REQ-050: (c) .exec( / .matchAll( / .search( and an exact .length anywhere are validation", () => {
  flags(`const m = VAT.exec(v);`, "logic-placement/c");
  flags(`const ms = [...v.matchAll(RE)];`, "logic-placement/c");
  flags(`const i = v.search(RE);`, "logic-placement/c");
  flags(
    `const ok = computed(() => digits().length === 10);`,
    "logic-placement/c",
  );
  clean(`const s = location.search; const n = q.length === 0;`);
  clean(`const long = computed(() => name().length > 40);`);
});

Deno.test("REQ-050: (d) date-rule library calls", () => {
  flags(`const late = isAfter(new Date(), due);`, "logic-placement/d");
  flags(`const d = differenceInCalendarDays(a, b);`, "logic-placement/d");
  flags(`const d = addBusinessDays(start, 3);`, "logic-placement/d");
  clean(`import { isAfter } from "npm:date-fns";`);
  clean(`const s = format(new Date(), "PP"); const a = addItem(x);`);
});

Deno.test("REQ-050: (e) access decided in the client — role/plan/tier compared, switched, keyed, tested; can…/may… set in a switch", () => {
  flags(`const show = user().role === "admin" && go();`, "logic-placement/e");
  flags(`if (u.roles.includes("owner")) f();`, "logic-placement/e");
  flags(`const r = RATES[customer().tier];`, "logic-placement/e");
  flags(`switch (acct.plan) { case "pro": break; }`, "logic-placement/e");
  flags(
    `switch (o.status) {\n  case "draft":\n    canEdit = true;\n    break;\n}`,
    "logic-placement/e",
  );
  clean(`type U = { role: string }; const u = { role: "x" }; show(u.role);`);
  clean(`switch (e.key) { case "Enter": handled = true; break; }`);
  clean(`const canSubmit = computed(() => draft() !== "" && !busy());`);
});

Deno.test("REQ-050: (f) a loop that try/awaits/catches is a client retry", () => {
  flags(
    `async function pay() {\n  while (true) {\n    try { await api.pay(); break; } catch { n++; }\n  }\n}`,
    "logic-placement/f",
  );
  flags(
    `for (let i = 0; i < 3; i++) { try { await send(); } catch (_) { /**/ } }`,
    "logic-placement/f",
  );
  clean(
    `while (cursor) { const p = await api.list({ cursor }); cursor = p.next; }`,
  );
  clean(`try { await api.load(); } catch (e) { err.set(e); }`);
});

Deno.test("REQ-050: template-literal interpolations are scanned like code, at their own line", () => {
  assertEquals(
    rules("const c = `x\n${o.qty * o.unitPrice} ${o.name}`;"),
    ["logic-placement/a@2"],
  );
  flags("const c = `${a.age >= 18 ? `adult` : `minor`}`;", "logic-placement/b");
  clean("const c = `${n} of ${count()}`; const k = `${uid()}-opt-${i}`;");
});

Deno.test("REQ-050 AMENDMENT: (a) a parenthesised group is an operand — `this.x`, `x()`, `x.value`, destructured props", () => {
  flags(
    `class G {\n  get due() { return this.subtotal * (1 - this.promoRate); }\n}`,
    "logic-placement/a",
  );
  flags(`const due = subtotal() * (1 - promoRate());`, "logic-placement/a");
  flags(`const due = a.value * (b.value);`, "logic-placement/a");
  flags(
    `const { price, qty } = props; const d = price * qty;`,
    "logic-placement/a",
  );
  clean(`const i = (active() + 1) % n; const h = (mins - (mins % 60)) / 60;`);
  clean(`const z = (zoom() - 0.1) * 100;`); // a plain-read group is no rate
  clean(`const u = (base() ?? "") + path();`); // a string group concatenates
  clean(`const t = (now - start) / DURATION; const y = (e.clientY - top) * k;`);
});

Deno.test("REQ-050 AMENDMENT: (e) a switch / if chain on a record's lifecycle field deciding data in ≥2 branches", () => {
  flags(
    `switch (inv().status) {\n  case "a": return ["x"];\n  case "b": return ["y"];\n}`,
    "logic-placement/e",
  );
  flags(
    `if (this.sub.state === "t") { m.set(3); } else if (this.sub.state === "a") { m.set(50); }`,
    "logic-placement/e",
  );
  clean(
    `switch (inv().status) {\n  case "a": return "badge-ok";\n  default: return "badge";\n}`,
  );
  clean(
    `if (status() === "a") { m.set(3); } else if (status() === "b") { m.set(5); }`,
  ); // a bare signal is UI state
  clean(
    `if (d.type === "ready") { s.set(d.x); } else if (d.type === "event") { e.set(d.y); }`,
  ); // not a lifecycle field — the workbench's message dispatch
  clean(`if (o.status === "paid") { r.set(1); }`); // one branch
});

const tmpl = async (html: string) =>
  (await checkTemplateLogic(html, "template.html")).findings.map((f) =>
    `${f.rule}@${f.line}`
  );

Deno.test("REQ-050 AMENDMENT: template.html expressions run (a)(b)(c)(e) at their line", async () => {
  assertEquals(await tmpl(`<p>x</p>\n@let d = item.price * (1 - item.pct);`), [
    "logic-placement/a@2",
  ]);
  assertEquals(await tmpl(`<b>{{ o.qty * o.unit }}</b>`), [
    "logic-placement/a@1",
  ]);
  assertEquals(await tmpl(`\n@if (cart.subtotal >= 50) { free }`), [
    "logic-placement/b@2",
  ]);
  assertEquals(await tmpl(`<button [disabled]="l.qty > l.stock">+</button>`), [
    "logic-placement/b@1",
  ]);
  assertEquals(await tmpl(`@let ok = u.age >= 18;`), ["logic-placement/b@1"]);
  assertEquals(await tmpl(`<i (click)="go(v.code.match(re))">x</i>`), [
    "logic-placement/c@1",
  ]);
  assertEquals(await tmpl(`@if (user.role === 'admin') { <b>x</b> }`), [
    "logic-placement/e@1",
  ]);
  assertEquals(await tmpl(`@if (total() > 3) { x }`), []); // (d) is logic.ts-only
});

Deno.test("REQ-050 AMENDMENT: template presentation — label ternaries, class/style/aria bindings, piped units", async () => {
  assertEquals(
    await tmpl(`@let t = m.minutesAgo < 60 ? 'min ago' : (m.hours + ' h');`),
    [],
  );
  assertEquals(await tmpl(`{{ m.age > 60 ? 'late' : 'ok' }}`), []);
  assertEquals(await tmpl(`{{ m.age > 60 ? 0 : 1 }}`), ["logic-placement/b@1"]);
  assertEquals(
    await tmpl(
      `<li [class.low]="i.stock < 5" [attr.aria-busy]="i.n > i.m" [style.opacity]="i.stock > 0 ? 1 : 0.5"></li>`,
    ),
    [],
  );
  assertEquals(await tmpl(`{{ i.priceCents / 100 | currency }}`), []);
  assertEquals(await tmpl(`{{ i.priceCents * 1.2 | currency }}`), [
    "logic-placement/a@1",
  ]);
});

Deno.test("REQ-050 AMENDMENT: a template @switch / @if chain on a lifecycle field rendering ≥2 action branches is (e); badges are not", async () => {
  assertEquals(
    await tmpl(
      `@switch (o.status) {\n  @case ('a') { <button (click)="x()">X</button> }\n  @case ('b') { <button (click)="y()">Y</button> }\n}`,
    ),
    ["logic-placement/e@1"],
  );
  assertEquals(
    await tmpl(
      `@if (o.state === 'a') { <button (click)="x()">X</button> } @else { <button (click)="y()">Y</button> }`,
    ),
    ["logic-placement/e@1"],
  );
  assertEquals(
    await tmpl(
      `@switch (o.status) { @case ('a') { <i>A</i> } @default { <i>B</i> } }`,
    ),
    [],
  );
  assertEquals(
    await tmpl(
      `@switch (status) { @case ('a') { <button (click)="x()">X</button> } @case ('b') { <button (click)="y()">Y</button> } }`,
    ),
    [],
  ); // a bare field may be UI state — a known hole
});

Deno.test("REQ-050 AMENDMENT: `<!-- sprig-logic: <reason> -->` suppresses a template line and the next", async () => {
  const r = await checkTemplateLogic(
    `<!-- sprig-logic: preview, the command recomputes -->\n@let t = o.qty * o.unit;\n@let u = o.qty * o.unit;`,
    "t.html",
  );
  assertEquals(r.findings.map((f) => f.line), [3]);
  assertEquals(r.suppressed, [
    { file: "t.html", line: 2, reason: "preview, the command recomputes" },
  ]);
});
