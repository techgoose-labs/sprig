// REQ-050 (integration) — an adversarial corpus for the logic-placement lint,
// both directions: realistic island logic.ts files that smuggle business logic
// into the frontend (fixtures/lints/logic-corpus-smuggled/<case>) MUST be
// caught — each by the rule named here — and realistic UI code
// (fixtures/lints/logic-corpus-legit/<case>) MUST pass. The cases no mechanical
// rule can tell from UI code are pinned as KNOWN HOLES: the lint lets them
// through today, and the test says so, so a rule that starts catching one
// flips the test and the hole list gets updated with it.
import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { lintLogicPlacement } from "./logic-placement.ts";

const LINTS = fromFileUrl(
  new URL("../../../../fixtures/lints/", import.meta.url),
);
const lint = (dir: string, name: string) =>
  lintLogicPlacement({ uiSrc: join(LINTS, dir, name) });
const show = (r: Awaited<ReturnType<typeof lint>>) =>
  r.findings.map((f) => `${f.line} ${f.rule} ${f.message}`).join("\n");

/** Smuggled case → the rule letter(s) that must fire on it. */
const SMUGGLED: Record<string, string[]> = {
  "tier-discount-table": ["d", "e"],
  "status-actions-switch": ["e"],
  "sku-regex": ["c"],
  "vat-exec": ["c"],
  "phone-digit-count": ["c"],
  "due-date-math": ["a"],
  "overdue-flag": ["b"],
  "overdue-date-library": ["d"],
  "sort-by-lifetime-value": ["a"],
  "filter-stale-leads": ["b"],
  "eligibility-ternary": ["b"],
  "line-items-reduce": ["a"],
  "money-rounding": ["a"],
  "tax-on-signal": ["a"],
  "free-shipping-threshold": ["b"],
  "retry-dedupe": ["f"],
  "role-permission": ["e"],
  "seat-limit": ["b"],
  "currency-conversion": ["a"],
  "password-policy": ["c"],
  "stock-availability": ["a"],
  "feature-flag-date": ["b"],
  "template-interpolation-total": ["a"],
  // REQ-050 AMENDMENT: lifecycle branching, and template.html expressions
  "status-actions-list": ["e"],
  "status-if-chain": ["e"],
  "template-discount-let": ["a"],
  "template-status-actions": ["e"],
  "template-threshold-if": ["b"],
  "template-disabled-binding": ["b"],
};

/** Smuggled cases the lint cannot tell from UI code, and why. */
const HOLES: Record<string, string> = {
  "business-id-template":
    "composing an identifier is string templating, same shape as a DOM id or list key",
  "coupon-code-literal":
    'equality with a string literal is how UI state switches (`status === "loading"`)',
  "quantity-cap":
    "`Math.min(n, MAX)` clamping is how zoom, scroll and resize bounds are written",
  "search-filter":
    "`.filter(…includes(q))` over loaded rows is how UI lists (toasts, a nav tree) are narrowed",
  "sort-by-name-rule":
    "a comparator without arithmetic (`localeCompare`, `||`) is display ordering in shape",
  "type-switch-shipping":
    'a switch on a non-lifecycle field (`delivery.type`) producing data is the workbench\'s own stage-message dispatch (`if (d.type === "ready") … else if (d.type === "instances") …`, app/src/pages/workbench/components/workbench/logic.ts:445)',
  "sla-countdown":
    "clock arithmetic is exempt (relative-time labels), and a local vs a literal is a UI counter",
};

const LEGIT = [
  "intl-number-format",
  "date-display",
  "toggle-open",
  "focus-keyboard",
  "debounce-input",
  "throttle-scroll",
  "optimistic-reconcile",
  "loading-error-state",
  "virtual-list",
  "pagination-cursor",
  "equality-ui-state",
  "a11y-attrs",
  "animation-frame",
  "upload-progress",
  "char-counter",
  "zoom-controls",
  "drag-resize",
  "toast-timer",
  "carousel-slides",
  "status-badge-switch",
  "template-time-label",
  "template-presentation-bindings",
  "template-status-badge",
];

for (const [c, letters] of Object.entries(SMUGGLED)) {
  Deno.test(`REQ-050: catches ${c}`, async () => {
    const r = await lint("logic-corpus-smuggled", c);
    assertEquals(r.checked.length, 1);
    assert(r.findings.length > 0, `${c}: no finding`);
    const fired = new Set(r.findings.map((f) => f.rule.split("/")[1]));
    for (const l of letters) {
      assert(fired.has(l), `${c}: rule (${l}) did not fire\n${show(r)}`);
    }
    for (const f of r.findings) {
      assert(f.message.startsWith(`(${f.rule.split("/")[1]}) `), f.message);
      assert(f.line > 0);
    }
  });
}

for (const [c, why] of Object.entries(HOLES)) {
  Deno.test(`REQ-050: known hole ${c} — ${why}`, async () => {
    const r = await lint("logic-corpus-smuggled", c);
    assertEquals(r.checked.length, 1);
    assertEquals(r.findings, [], `${c} is caught now — move it to SMUGGLED`);
  });
}

for (const c of LEGIT) {
  Deno.test(`REQ-050: allows ${c}`, async () => {
    const r = await lint("logic-corpus-legit", c);
    assertEquals(r.checked.length, 1);
    assertEquals(r.findings.length, 0, `${c}:\n${show(r)}`);
  });
}

Deno.test("REQ-050: allows suppressed-preview — the `// sprig-logic:` reason is listed, not a finding", async () => {
  const r = await lint("logic-corpus-legit", "suppressed-preview");
  assertEquals(r.findings.length, 0, show(r));
  assertEquals(r.suppressed.map((s) => s.reason), [
    "keystroke preview only — the placeOrder command recomputes and its answer replaces this",
  ]);
});

Deno.test("REQ-050: every corpus case on disk is named by a test", async () => {
  const names = async (dir: string) =>
    (await Array.fromAsync(Deno.readDir(join(LINTS, dir))))
      .map((e) => e.name).sort();
  assertEquals(
    await names("logic-corpus-smuggled"),
    [...Object.keys(SMUGGLED), ...Object.keys(HOLES)].sort(),
  );
  assertEquals(
    await names("logic-corpus-legit"),
    [...LEGIT, "suppressed-preview"].sort(),
  );
});
