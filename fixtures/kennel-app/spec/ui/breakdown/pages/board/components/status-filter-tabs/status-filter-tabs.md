# status-filter-tabs

The board's status filter: a row of five tabs (All · Booked · Checked in ·
Walking · Checked out). The current `?status=` param is highlighted. Every tab
is a link to the board with a different `?status=<s>`, and the server renders
the filtered dog list. Mock region: `#app > [role="tablist"]` (one element),
1232×48 at 1280 and 351×48 at 375.

## 1. Classification & behavior

- **Bucket:** `static`. There is no `logic.ts`: the folder is `template.html`
  plus an optional `styles.css`.
- **Interaction tier:** `static`, for its one interaction. Choosing a tab
  navigates, the request goes out, and the server responds with the board
  already filtered. Nothing is written, and the unit holds no client state.
- **Data contract:** `dataNeeds: []`. The unit renders the current `status`
  param, which the page passes down from the URL. It never filters rows itself:
  filtering is the `dogList` query `GET /api/dogs?status=<s>` in
  `data-model.md`, and the **board page** issues it, not this unit.
- **Data source:** the URL param `status` (`all` | `booked` | `checked-in` |
  `walking` | `checked-out`). A missing or unknown value renders as `all`.
- **Liveness:** request-response. Nothing in the mock is pushed.
- **Data-shape hazard:** none. The labels are fixed and come from the status
  enum in its display order (`ORDER` in `js/status-filter-tabs.js`), not from
  data.
- **Mock toggle behavior (extracted):** in the mock's click handler, clicking
  the *already active* non-`all` tab resets the filter to `all`:
  `ui.filter = f.dataset.filter === ui.filter && f.dataset.filter !== "all" ? "all" : f.dataset.filter`.
  In the link model, that becomes: the active tab's `href` is `?status=all`
  when `status !== "all"`, and every other tab links to its own `?status=<s>`.
  *(Described, not extracted: verify during build that the template's href
  expression reproduces this.)*
- **Channels:** none. This unit takes part in no `dog` / `day` / `toasts`
  wiring.

## 2. Anatomy

```
div[role=tablist].tabs.tabs-box.sft-list  (overflow-x:auto; flex-wrap:nowrap; margin-bottom 1rem)
├─ a[role=tab]#sft-all          .tab (.tab-active when status==all)          "All"
├─ a[role=tab]#sft-booked       .tab (.tab-active when status==booked)       "Booked"
├─ a[role=tab]#sft-checked-in   .tab (.tab-active when status==checked-in)   "Checked in"
├─ a[role=tab]#sft-walking      .tab (.tab-active when status==walking)      "Walking"
└─ a[role=tab]#sft-checked-out  .tab (.tab-active when status==checked-out)  "Checked out"
```

- The source element **is daisyUI `tabs` + `tabs-box` + `tab` + `tab-active`**.
  Keep those daisyUI class names exactly. They supply the base-200 box, the
  `radius-field` (0.75rem) corners, 0.25rem padding, the 40px tab height
  (`--size-field * 10`), 0.75rem inline padding, 0.875rem text, inactive tabs
  at `base-content` 50%, and the active tab's `base-100` pill with the inset and
  drop shadow. Do not re-implement any of these in scoped CSS.
- Every tab also carries the Tailwind utility `whitespace-nowrap`. The list
  carries `mb-4 overflow-x-auto flex-nowrap`. Either keep those utilities or
  move them onto the unit's own prefixed class `sft-list` in `styles.css`
  (`margin-bottom:1rem; overflow-x:auto; flex-wrap:nowrap`) and `sft-tab`
  (`white-space:nowrap`). **Never** add scoped rules to `.tab`, `.tabs` or
  `.tab-active` (daisyUI's rules apply document-wide).
- Element change: the mock uses `<button role="tab" data-filter="…">`. The
  rebuild uses `<a role="tab" href="?status=…">`, because filtering is a query
  link. Tailwind preflight gives `a` `color: inherit; text-decoration: inherit`,
  so the pixels should match the button version. The `_reference` diff checks
  that.
- No slots or children. The five labels are fixed.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `status` | `"all" \| "booked" \| "checked-in" \| "walking" \| "checked-out"` | `"all"` | `select` (the 5 values) | no (static; the page passes it from the URL) |

## 4. States → cases

Every case has `_tier: "static"`. `_reference` paths are git-root-relative,
under
`fixtures/kennel-app/spec/ui/breakdown/pages/board/components/status-filter-tabs/screenshots/`.
Every still was shot at DPR 1 with fonts loaded and on whole pixels.
`tolerance` stays at the default of 0.01. The default theme is `brand`
(`design-tokens.md` → `Default theme: brand`).

| state | case | `status` | `_viewport` | `_theme` | `_reference` still | slot size |
| --- | --- | --- | --- | --- | --- | --- |
| default: All active | `default` | `all` | 1280 | brand | `status-filter-tabs@1280.png` | 1232×48 |
| All active, lg | `all-1024` | `all` | 1024 | brand | `status-filter-tabs@1024.png` | 976×48 |
| All active, md | `all-768` | `all` | 768 | brand | `status-filter-tabs@768.png` | 720×48 |
| All active, sm | `all-640` | `all` | 640 | brand | `status-filter-tabs@640.png` | 616×48 |
| All active, tablist overflowing | `all-375` | `all` | 375 | brand | `status-filter-tabs@375.png` | 351×48 |
| dark theme | `brand-dark` | `all` | 1280 | brand-dark | `status-filter-tabs@1280-brand-dark.png` | 1232×48 |
| a non-default tab active | `walking` | `walking` | 1280 | brand | `status-filter-tabs-walking@1280.png` | 1232×48 |
| last tab active at 375, clipped off-screen | `checked-out-375` | `checked-out` | 375 | brand | `status-filter-tabs-checked-out@375.png` | 351×48 |

There are no hover, disabled, loading, empty or error states. The labels are
fixed, nothing loads, and no tab is ever disabled. The board's "filtered-empty"
message ("No dogs are <b>x</b> right now" + "Show all dogs") belongs to the
dog list, not to this unit.

The `checked-out-375` still records the mock **as it is**: `scrollLeft` is 0,
so the active "Checked out" tab is cut off at the right edge ("Checked"). See
§6 (Jank) for the tension with the recommended fix.

## 5. Events

This is a static unit, so each event is a native click whose observable effect
is navigation. Write the predicates against the rebuild's `a#sft-<status>` ids.

| # | trigger | predicate sketch | lands in |
| --- | --- | --- | --- |
| E1 | click an inactive tab (e.g. Walking) | `ev.expect(e => e.source === "a#sft-walking" && e.type === "click")`, then `await expect(page).toHaveURL(/[?&]status=walking\b/)` | `cases/default/tests/select-tab.spec.ts` |
| E2 | click the active non-`all` tab (the mock's toggle-off) | on `walking`: `ev.expect(e => e.source === "a#sft-walking" && e.type === "click")`, then `await expect(page).toHaveURL(/[?&]status=all\b/)` | `cases/walking/tests/toggle-off.spec.ts` |
| E3 | click the active `All` tab | on `default`: `ev.expect(e => e.source === "a#sft-all" && e.type === "click")`, then URL stays at `status=all` (or no param) | `cases/default/tests/select-tab.spec.ts` |
| E4 | every tab's href (DOM-level, no click) | `for s of [booked, checked-in, walking, checked-out]: expect(page.locator("#sft-"+s)).toHaveAttribute("href", "?status="+s)` on `default` | `cases/default/tests/hrefs.spec.ts` |
| E5 | the active tab is marked | `expect(page.locator("#sft-walking")).toHaveClass(/\btab-active\b/)` and `toHaveAttribute("aria-selected","true")`; the other four have no `tab-active` | `cases/walking/tests/active.spec.ts` |

Headless `sprig isolate test` runs specs under Node Playwright. For E1–E3,
assert the DOM or URL effect and skip `capture`. Use `ev.expect` only in the
interactive workbench.

## 6. Motion

- **Extracted:** none. `.tab` computes `transition-property: all`,
  `transition-duration: 0s` and `animation-name: none`. After clicking
  `[role=tab][data-filter=walking]`, `getAnimations()` returns `[]`. The mock
  also rebuilds `#app.innerHTML` on every click, so a transition could not run
  even if one were declared (`screenshots/motion.json`). There is no
  filmstrip.
- **No `_motion` case.** No motion was extracted. Also, the captured
  `motion.json` is shaped `{ unit, source, clickTab: { animations: [] } }`, and
  the runner rejects that: a probe case said `"_motion" spec not an array of
  animations (nor { "animations": [...] })`.
- **Jank** (`screenshots/jank.md`): clicking all 5 tabs dropped 0% of frames,
  with a max frame of 16.8ms, no LoAF and CLS 0. The synchronous render took
  0.8–2.7ms per click.
- **Jank lint + rebuild fix:** at 375px the tablist overflows (scrollWidth 393 >
  clientWidth 351), and the active tab is not scrolled into view (`scrollLeft`
  stays 0 with `checked-out` active). The capture agent's fix is
  `scrollIntoView({inline:"nearest"})` on the active tab. That needs script,
  which a `static` unit does not have. Options for the build: (a) accept the
  mock's behavior, which `checked-out-375` pins; (b) have the server render the
  list with an initial scroll offset. There is no pure-CSS way to set
  `scrollLeft`, so this option is not available without script. (c) The analyst
  re-tiers the unit. *Described, not extracted: this is a build decision. If
  the build scrolls the active tab into view, `checked-out-375`'s still no
  longer matches and must be recaptured.*
- **Reduced motion:** nothing to reduce. The mock's global
  `prefers-reduced-motion` rule clamps durations to 0.01ms.

## 7. Responsive

The source has no `@media` rule of its own. The tablist is full-width at every
breakpoint (unit width = page content width: 1232 @1280, 976 @1024, 720 @768,
616 @640, 351 @375). The only change with viewport comes from the page's
padding (`p-3` → `md:p-6` at 768). The five tabs fit at 640 and above. Below
about 393px the row overflows horizontally: `overflow-x-auto` + `flex-nowrap`
keep one line and scroll instead of wrapping, and `whitespace-nowrap` stops
"Checked in" / "Checked out" from breaking.

## 8. A11y

- `role="tablist"` on the container and `role="tab"` on each link, as in the
  source. Mark the active tab `aria-selected="true"` alongside `tab-active`
  (daisyUI also styles `[aria-selected="true"]` as active). The mock sets only
  the class, so this is an a11y addition. The pixels are the same.
- The tabs are links that navigate, not panel switchers, and there is no
  `tabpanel`. For that reason, `aria-current="page"` on the active link is an
  acceptable alternative to `aria-selected`: daisyUI treats both as active.
  Choose one. *(Described, not extracted.)*
- Keyboard: every link is in the Tab order (native `<a href>`), and Enter
  navigates. There is no arrow-key roving: that would need script.
- Focus: daisyUI `tabs-box > .tab:focus-visible` draws a 2px solid outline with
  offset 2px and `z-index: 1`. Keep it.
- Reduced motion: not applicable (no motion).

## 9. Used on

- `board` only (page-local). The analyst's evidence: tabs as query links;
  primitive: tabs.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/board/components/status-filter-tabs/`
  (the page-local rule is `pages/<page>/components/<name>`). The selector is
  `<status-filter-tabs>`. Files: `template.html`, an optional `styles.css`, no
  `logic.ts`.
- **Preview routes:**
  `/pages/board/status-filter-tabs/<case>`. The `category`/`folder` values come
  from `fixture.json`, but the prefix follows the `src/pages/` root the unit
  lands in: `sprig isolate list --root fixtures/kennel-app` printed
  `/pages/board/status-filter-tabs/default` for a temporary copy at that path,
  even though the kind is `static`.

| case | state | `_reference` still | tests (from §5) |
| --- | --- | --- | --- |
| `default` | All active @1280 | `status-filter-tabs@1280.png` | E1, E3, E4 → `select-tab.spec.ts`, `hrefs.spec.ts` |
| `all-1024` | All active @1024 | `status-filter-tabs@1024.png` | reference only |
| `all-768` | All active @768 | `status-filter-tabs@768.png` | reference only |
| `all-640` | All active @640 | `status-filter-tabs@640.png` | reference only |
| `all-375` | All active, overflowing @375 | `status-filter-tabs@375.png` | reference only |
| `brand-dark` | All active, dark @1280 | `status-filter-tabs@1280-brand-dark.png` | reference only |
| `walking` | Walking active @1280 | `status-filter-tabs-walking@1280.png` | E2, E5 → `toggle-off.spec.ts`, `active.spec.ts` |
| `checked-out-375` | Checked out active, clipped @375 | `status-filter-tabs-checked-out@375.png` | reference only (see §6 jank) |

- **Loop:** scaffold the folder, then drop in `isolate/` from this breakdown
  unchanged. Run `sprig isolate test --root fixtures/kennel-app --json`: the
  eight `reference:` rows are the pixel diff. The app must load Quicksand 400/600
  in its document head, or every row fails on the fallback font. Next, lift
  E1–E5 into the `tests/*.spec.ts` files listed above and run again. Iterate
  until everything is green, and only then compose the unit into the `board`
  page (`<status-filter-tabs [status]="status">`, placed after the status strip
  and before the dog list).
