// REQ-069 (integration) — a DRY corpus for the duplicate-templates lint, both
// directions. Each case is a tiny app under fixtures/lints/dry-corpus-*/<case>/src.
// A REINVENTED case re-creates an existing component (inline, or as a second
// component doing the same job) and MUST be caught by the rule named here; a
// LEGIT case is ordinary reuse or genuinely different markup and MUST pass with
// no finding at all (the suppressed case lists its reason instead).
import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { lintDuplicateTemplates } from "./duplicate-templates.ts";

const LINTS = fromFileUrl(
  new URL("../../../../fixtures/lints/", import.meta.url),
);
const lint = (dir: string, name: string) =>
  lintDuplicateTemplates({ uiSrc: join(LINTS, dir, name, "src") });
type R = Awaited<ReturnType<typeof lint>>;
const show = (r: R) =>
  JSON.stringify(
    r.findings.map((f) =>
      `${f.severity} ${f.file.split("/src/")[1]}:${f.line} ${f.message}`
    ),
    null,
    2,
  );

/** The three rules, by the message each one writes. */
const RULES = {
  /** a component's markup re-created inside another template */
  inline: {
    severity: "error",
    message:
      /^this markup is `<[a-z-]+>` \(containment \d\.\d\d\) — compose it$/,
  },
  /** two templates with different markup and the same bindings */
  "same-job": { severity: "warn", message: /^same bindings as `<[a-z-]+>`/ },
  /** two whole templates with the same structure (REQ-028) */
  "near-duplicate": {
    severity: "error",
    message: /^near-duplicate templates: /,
  },
} as const;

/** Reinvented case → the rule that must catch it, and the file:line it points at. */
const REINVENTED: Record<
  string,
  { rule: keyof typeof RULES; at: string; names?: string }
> = {
  "inline-badge-in-card": {
    rule: "inline",
    at: "pages/board/components/dog-card/template.html:6",
    names: "status-badge",
  },
  "inline-avatar": {
    rule: "inline",
    at: "pages/team/template.html:6",
    names: "user-avatar",
  },
  "second-empty-state": {
    rule: "inline",
    at: "pages/invoices/template.html:6",
    names: "empty-state",
  },
  "toast-one-class-changed": {
    rule: "inline",
    at: "pages/settings/template.html:5",
    names: "toast-note",
  },
  "nav-duplicated-per-page": {
    rule: "inline",
    at: "pages/reports/template.html:2",
    names: "main-nav",
  },
  "form-row-rebuilt": {
    rule: "inline",
    at: "pages/signup/template.html:4",
    names: "form-field",
  },
  "stat-tile-recreated": {
    rule: "inline",
    at: "pages/dashboard/template.html:5",
    names: "stat-tile",
  },
  "table-row-repeated": {
    rule: "inline",
    at: "pages/orders/template.html:6",
    names: "order-row",
  },
  "modal-shell-copied": {
    rule: "inline",
    at: "pages/users/components/delete-user/template.html:2",
    names: "modal-shell",
  },
  "alert-inline-in-shared": {
    rule: "inline",
    at: "shared-components/data-panel/template.html:5",
    names: "load-error",
  },
  "page-local-rebuilt-in-sibling": {
    rule: "inline",
    at: "pages/shop/components/product-card/template.html:5",
    names: "price-tag",
  },
  "breadcrumbs-copied": {
    rule: "inline",
    at: "pages/invoice/template.html:2",
    names: "crumbs",
  },
  "pager-copied": {
    rule: "inline",
    at: "pages/audit/components/audit-log/template.html:3",
    names: "pager",
  },
  "status-badge-in-list-row": {
    rule: "inline",
    at: "pages/tasks/template.html:7",
    names: "status-badge",
  },
  "same-job-contact-card": {
    rule: "same-job",
    at: "pages/people/components/contact-card/template.html:1",
    names: "contact-tile",
  },
  "same-job-confirm-prompts": {
    rule: "same-job",
    at: "shared-components/delete-confirm/template.html:1",
    names: "remove-prompt",
  },
  "whole-template-copy": {
    rule: "near-duplicate",
    at: "pages/news/components/news-card/template.html:1",
  },
  "tiny-icon-badge-copied": {
    rule: "inline",
    at: "pages/billing/template.html:4",
    names: "icon-badge",
  },
};

/** Reinvented cases no rule can tell from legitimate markup today, and why.
 *  The test pins that the lint lets each through, so a rule that starts
 *  catching one flips it and the hole list is updated with it. */
const HOLES: Record<string, string> = {
  "card-rerolled-element-names":
    "the same card with article/div/h2 renamed section/section/h3 keeps every class but no tag path " +
    "(tag containment < 0.6); class-only containment would catch it at 1.00 but also scores two " +
    "different kennel cards built from the same daisyUI parts (dog-actions in dog-notes) at 1.00",
};

const LEGIT = [
  "badge-vs-chip",
  "card-with-and-without-actions",
  "list-item-vs-grid-tile",
  "icon-only-vs-labelled-button",
  "two-alerts-different-roles",
  "skeleton-vs-real-card",
  "page-composes-shared",
  "shared-composes-shared",
  "parent-passes-props-to-child",
  "thin-wrapper-component",
  "table-vs-list-same-dto",
  "menu-vs-tabs",
  "stats-compose-stat-tile",
  "tiny-divider-primitive",
  "classless-layout-wrapper",
  "badge-with-a-different-job",
];

for (const [name, want] of Object.entries(REINVENTED)) {
  Deno.test(`REQ-069: catches ${name.replaceAll("-", " ")}`, async () => {
    const r = await lint("dry-corpus-reinvented", name);
    const rule = RULES[want.rule];
    const hit = r.findings.find((f) =>
      f.severity === rule.severity && rule.message.test(f.message) &&
      `${f.file.split("/src/")[1]}:${f.line}` === want.at &&
      (!want.names || f.message.includes(`<${want.names}>`) ||
        want.rule === "near-duplicate")
    );
    assert(hit, `expected ${want.rule} at ${want.at}:\n${show(r)}`);
    assertEquals(r.suppressed, []);
  });
}

for (const [name, why] of Object.entries(HOLES)) {
  Deno.test(`REQ-069: known hole ${name.replaceAll("-", " ")} — ${why}`, async () => {
    const r = await lint("dry-corpus-reinvented", name);
    assertEquals(r.findings, [], show(r));
  });
}

for (const name of LEGIT) {
  Deno.test(`REQ-069: allows ${name.replaceAll("-", " ")}`, async () => {
    const r = await lint("dry-corpus-legit", name);
    assertEquals(r.findings, [], show(r));
    assertEquals(r.suppressed, []);
  });
}

Deno.test("REQ-069: allows a suppressed inline badge — listed with its reason, never silent", async () => {
  const r = await lint("dry-corpus-legit", "suppressed-inline-badge");
  assertEquals(r.findings, [], show(r));
  assertEquals(r.suppressed.length, 1);
  assert(
    /^justified: pages\/print:6 ⊇ <status-badge> \(\d\.\d\d\) — the print sheet is static HTML/
      .test(r.suppressed[0].reason),
    r.suppressed[0].reason,
  );
});

Deno.test("REQ-069: every corpus case on disk is named by a test", async () => {
  const names = async (dir: string) => {
    const out: string[] = [];
    for await (const e of Deno.readDir(join(LINTS, dir))) {
      if (e.isDirectory) out.push(e.name);
    }
    return out.sort();
  };
  assertEquals(
    await names("dry-corpus-reinvented"),
    [...Object.keys(REINVENTED), ...Object.keys(HOLES)].sort(),
  );
  assertEquals(
    await names("dry-corpus-legit"),
    [...LEGIT, "suppressed-inline-badge"].sort(),
  );
});
