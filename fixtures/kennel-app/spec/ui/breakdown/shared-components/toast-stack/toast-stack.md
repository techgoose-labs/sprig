# toast-stack

Shared island — the page's transient feedback queue. Mock region: `#toasts`
(an empty `<div>` in `<body>`; children appended at runtime by `toast()`).
Evidence: `source.html`, `js/toast-stack.js` (toast() lines 275-282 + callers),
`css/toast-stack.matched.css`, `screenshots/`.

## 1. Classification & behavior

- **Bucket:** island (`template.html` + `logic.ts` + `styles.css`), shared.
- **Interaction tier:** `pure-client`. The stack itself makes no server call;
  it only renders what writers push. No `pending` / `rolled-back` cases apply
  (those belong to the writers: `dog-actions`, `dog-notes`, `close-day-control`).
- **Why an island:** it owns a client queue that changes after first paint and
  runs a per-entry timer — nothing about it can be server-rendered.
- **Client state owned (signals):**
  - `toasts` — ordered array of `{ kind: "error" | "success", msg: string }`,
    oldest first (append order = top-to-bottom order in the stack).
  - per-entry dismiss timer, `lifetime` ms (captured: **3500**), started when
    the entry enters the queue; on expiry the entry is removed from `toasts`.
- **Channel `toasts` (page-scoped):** toast-stack **sets** the channel (owns the
  queue); `dog-actions`, `dog-notes` (on dog-detail) and `close-day-control` (on
  day-summary) **edit** it by pushing an entry. Each page template composes its
  own `<toast-stack>` as a sibling of its writing islands — `<router-outlet>`
  forwarding does not reach islands nested inside a page, so there is no single
  global mount in the rebuild (the mock had one `#toasts` in `<body>`). The
  board raises no toasts.
- **Messages pushed in the mock** (callers, `js/toast-stack.js`):
  - status command rolled back → error `"<Dog name>: <status label lowercased> didn't go through — reverted."`
  - note save rolled back → error `"Note for <Dog name> wasn't saved — it's back in the box."`
  - `day.close` failed → error `"The day couldn't be closed — nothing changed."`
  - `day.close` succeeded → success `"Day closed — ledger locked."`
- **Data source:** client only (the channel). Honest-empty: no entries → the
  container renders with no children and is invisible (transparent, no size).
- **Liveness:** request-response; nothing is pushed from a server.
- **Data-shape hazard:** `msg` is user-derived (dog name) — the mock escapes it
  (`esc(msg)`); the rebuild must bind it as text, never as HTML.
- No cap on the queue in the mock (none extracted); no close button; no
  pause-on-hover.

## 2. Anatomy

```
<toast-stack>                                    host (selector = folder basename)
  div.toast.toast-end.toast-bottom.z-50.mb-12    daisyUI `toast` container — KEEP (fixed, bottom-right)
    div.alert.alert-{error|success}.shadow-sm.max-w-xs   daisyUI `alert` — KEEP, one per queue entry
      svg.size-5.shrink-0                        lucide icon inline: error → circle-alert, success → circle-check
      span                                       the message text
```

- The container and each entry ARE daisyUI components (`toast`, `alert`,
  `alert-error`, `alert-success`) — keep those class names. Any extra class the
  build adds to its own parts is prefixed `toast-stack-…` (e.g.
  `toast-stack-leaving` for the exit state), never a bare daisyUI name.
- Measured geometry: container `position: fixed`, `inset-inline: auto 1rem`,
  `bottom: 1rem` + `mb-12` (48px) → the stack's bottom edge sits **64px** above
  the viewport bottom, right edge **16px** from the viewport's right; column
  flex, `gap: .5rem` (8px). Entry `max-width: var(--container-xs)` = 320px;
  a two-line entry is 320x66, a one-line success entry 250x46 (width = content).
  Alert: `padding-block .75rem`, `padding-inline 1rem`, `gap 1rem`,
  `font-size .875rem / line-height 1.25rem`, `border-radius var(--radius-box)`,
  `shadow-sm`, colors from `--color-error`/`--color-error-content` and
  `--color-success`/`--color-success-content` (design-tokens.md).
- Icon: the mock renders `<i data-lucide>` then calls `lucide.createIcons()`
  (whole-document rescan per toast) — the rebuild renders the SVG inline in the
  template, switched on `kind`.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `lifetime` | number (ms) | `3500` | `number` | no |
| `toasts` | `{ kind, msg }[]` | `[]` | none — seeded per case via `_signals` (an array has no control type) | yes |

## 4. States → cases

Every case: `_tier: "pure-client"`. Default theme `brand` (design-tokens.md
`Default theme: brand`); dark stills are `brand-dark`. `_reference` paths are
git-root-relative:
`fixtures/kennel-app/spec/ui/breakdown/shared-components/toast-stack/screenshots/…`.

| case | state | `_signals.toasts` | `_viewport` / `_theme` | check |
| --- | --- | --- | --- | --- |
| `empty` | nothing summoned — no alerts | `[]` | 1280 / brand | test E1 |
| `error-1280` | one error toast (rolled-back check-in) | Biscuit error | 1280 / brand | `_reference` `toast-stack-error@1280.png` (320x66) |
| `error-375` | same at phone width | Biscuit error | 375 / brand | `_reference` `toast-stack-error@375.png` (320x66) |
| `error-1280-brand-dark` | error toast, dark theme | Biscuit error | 1280 / brand-dark | `_reference` `toast-stack-error@1280-brand-dark.png` |
| `success-1280` | one success toast | day-closed success | 1280 / brand | `_reference` `toast-stack-success@1280.png` (250x46) |
| `stacked-1280` | two stacked errors (two failed Close-the-day) | day-close error ×2 | 1280 / brand | `_reference` `toast-stack-stacked@1280.png` (320x140) |
| `stacked-1280-brand-dark` | error then success, dark | day-close error, day-closed success | 1280 / brand-dark | `_reference` `toast-stack-stacked@1280-brand-dark.png` (320x120) |
| `entrance` | entry pops in | day-closed success | 1280 / brand | `_motion` `motion.json` |
| `auto-dismiss` | entry removed after `lifetime` | Biscuit error | 1280 / brand | test E3 |
| `page-context` | anchored bottom-right over the page | Biscuit error | 1280x800 / brand | test E2 (still `toast-stack-page-dog@1280.png` is a full-viewport page shot, see gaps) |

Captured values: Biscuit error = `"Biscuit: checked in didn't go through — reverted."`;
day-close error = `"The day couldn't be closed — nothing changed."`;
day-closed success = `"Day closed — ledger locked."`.

## 5. Events

The stack emits no events of its own (no buttons, no inputs). Its contract is
observable DOM, asserted as predicates (plain Playwright under
`sprig isolate test`; host `toast-stack`, hydration gate
`sprig-island[data-sel="toast-stack"][data-sprig-hydrated]`):

- **E1 (empty):** `await expect(page.locator("toast-stack .alert")).toHaveCount(0)`.
- **E2 (anchoring, 1280x800):** one `.alert` whose box satisfies
  `b => Math.round(b.x + b.width) === 1264 && Math.round(b.y + b.height) === 736`
  (16px right inset, 16+48px bottom inset); at 375 the captured box is x=39,
  right edge 359.
- **E3 (auto-dismiss):** `await expect(page.locator("toast-stack .alert")).toHaveCount(1)`
  right after hydration, then `toHaveCount(0, { timeout: 4500 })`; and it is
  still present at ~3000 ms (not removed early).
- **E4 (kind → look):** in `stacked-1280-brand-dark`,
  `.alert:nth-child(1)` has class `alert-error` and text
  "The day couldn't be closed — nothing changed.", `.alert:nth-child(2)` has
  `alert-success` and "Day closed — ledger locked." (append order preserved).
- **E5 (channel push, composition-level):** a writer pushing
  `{ kind: "error", msg }` onto the `toasts` channel appends one `.alert` at
  the bottom of the stack — assert on the page that composes it (dog-detail /
  day-summary), not in isolation.

## 6. Motion

Extracted (`screenshots/motion.json`, filmstrip `screenshots/filmstrip.png`):

- Trigger: entry appended to the container.
- CSSAnimation `toast` on `div.alert` (daisyUI rule `.toast > *`, only under
  `@media (prefers-reduced-motion: no-preference)`).
- Keyframes (2): `offset 0 {opacity: 0; scale: .9}` → `offset 1 {opacity: 1; scale: 1}`.
- Duration 250 ms, easing `ease-out`, delay 0, 1 iteration, fill `none`.
- Exit: none — `el.remove()` after 3500 ms (instant).

Jank (`screenshots/jank.md`): entrance 72 frames, 0 % dropped, max 16.8 ms,
CLS 0; lifetime+removal 419 frames, 0.5 % dropped, max 33.4 ms, CLS 0.
Findings and rebuild fixes:
- entrance opacity+scale is compositor-only — keep as is (comes free with
  daisyUI `toast`).
- no exit: the toast vanishes in one frame and the remaining entries snap —
  rebuild keeps the timer for lifetime only; on expiry add
  `toast-stack-leaving` (opacity/scale out, transform/opacity only), remove the
  entry on `animationend` (immediately under reduced motion); FLIP siblings
  with `transform` if a smooth restack is wanted.
- `lucide.createIcons()` per toast rescans the document — render the icon
  inline.

The `entrance` case carries `_motion` against `motion.json`.

## 7. Responsive

No `@media` in the unit other than the reduced-motion gate. Same bottom-right
anchoring at every width: at 375 the 320px entry sits at x=39 (16px right
inset); daisyUI caps the container at `max-width: calc(100vw - 2rem)`.
Stills: 1280 (brand, brand-dark) and 375 (brand).

## 8. A11y

- Mock: no roles or live region (plain `div`s) — extracted as-is.
- Rebuild: container is a live region so screen readers hear pushes —
  errors `role="alert"` (assertive), success `role="status"` (polite); icon
  `aria-hidden="true"` (the text carries the meaning).
- Not focusable, no keyboard interaction, never steals focus.
- Reduced motion: entrance animation is already gated by
  `prefers-reduced-motion: no-preference`; gate the exit animation the same
  way.
- 3500 ms is short for long messages (WCAG 2.2.1) — the mock has no dismiss
  or pause; flagged, not changed.

## 9. Used on

- `dog-detail` — edited by `dog-actions`, `dog-notes`.
- `day-summary` — edited by `close-day-control`.
- Not on the board (it raises no toasts). Shared: one component, composed
  per page (page-scoped channel).

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/toast-stack/`
  (`template.html`, `logic.ts`, `styles.css`); selector `<toast-stack>`.
- **Drop in:** this folder's `isolate/` (`fixture.json` + `cases/`).
- **Preview routes:** `/components/shared-components/toast-stack/<case>` —
  `empty`, `error-1280`, `error-375`, `error-1280-brand-dark`, `success-1280`,
  `stacked-1280`, `stacked-1280-brand-dark`, `entrance`, `auto-dismiss`,
  `page-context`.
- **Diffs:** the six `_reference` cases above (tolerance default 0.01) and the
  `_motion` row on `entrance`.
- **Events → tests:** E1 → `cases/empty/tests/empty.spec.ts`; E2 →
  `cases/page-context/tests/anchoring.spec.ts`; E3 →
  `cases/auto-dismiss/tests/auto-dismiss.spec.ts`; E4 →
  `cases/stacked-1280-brand-dark/tests/order.spec.ts`; E5 → the dog-detail and
  day-summary page tests (composition).
- **Loop:** scaffold the folder → drop `isolate/` → `sprig isolate test --json`
  (the `_reference` rows are the diff) → lift E1–E4 into the case tests → run
  → iterate to green, then compose into dog-detail and day-summary.
- **Build notes:** the `_reference` stills are screenshots of the alert stack
  (320 wide), so the element the runner screenshots must be the stack's box —
  a host with only a `position: fixed` child has no box of its own; verify
  which element the runner targets. Seeded entries start their 3500 ms timer
  at hydration, so reference/motion rows must be taken inside that window.
