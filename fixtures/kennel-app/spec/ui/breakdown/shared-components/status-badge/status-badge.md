# status-badge

Shared, static display primitive: one dog's boarding status rendered as a daisyUI
`badge` with a lucide icon and a label. Selector `<status-badge>`.

## 1. Classification & behavior

- **Bucket:** `static` (no `logic.ts`). **Interaction tier:** `static`, with no
  interactions of its own. It is pure display from a `status` prop. Where it
  sits inside something clickable (the strip filter `button`, the dog-card
  `a[href="#/dog/<id>"]`), the host owns that click.
- **Data source:** props only (`status`, `size`). `dataNeeds: []`, and it has no
  row in data-model.md's reverse index. Every status maps to a badge, so there
  is no empty state. An unknown status is not in the mock (the mock's
  `STATUS[status]` would throw). The build should render nothing for an unknown
  status, not a broken badge. Described, not extracted.
- **Liveness:** request-response. It re-renders only when a host passes a new
  `status`, for example dog-heading after the `dog` channel updates.
- **Data-shape hazard:** none. `status` is a closed enum:
  `booked | checked-in | walking | checked-out`.

## 2. Anatomy

The source element IS a daisyUI component, so the build keeps daisyUI `badge`
and its modifiers `badge-info`, `badge-success`, `badge-accent`,
`badge-outline`, `badge-soft` and `badge-sm`. It proposes no own class names.

```
<span class="badge {variant} {badge-sm?} whitespace-nowrap">
  <svg lucide-{icon} class="size-[1em]" aria-hidden="true"/>   ← 1em square, currentColor stroke 2
  {label}
</span>
```

The STATUS map, verbatim from `js/status-badge.js` (lines 244-249):

| status | label | variant classes | lucide icon |
| --- | --- | --- | --- |
| `booked` | Booked | `badge-info badge-soft` | `calendar-clock` |
| `checked-in` | Checked in | `badge-success badge-soft` | `house` |
| `walking` | Walking | `badge-accent` (solid) | `footprints` |
| `checked-out` | Checked out | `badge-outline` | `log-out` |

- **Size:** `md` adds no class. `sm` adds `badge-sm`: `--size` goes from
  `calc(var(--size-selector,.25rem)*6)` to `*5`, and font-size from `0.875rem`
  to `0.75rem`. Captured heights are 24px (md) and 20px (sm).
- **Icon:** use the lucide SVG paths exactly as in `source.html`. The mock
  lets `lucide.createIcons()` swap `<i data-lucide>` for an `<svg>` after every
  render. The build should inline the four SVGs in `template.html`, chosen by
  `@switch`/`@if` on `status`, and drop the runtime icon swap.
- **Key CSS** (`css/status-badge.css`): `.badge` is an inline-flex with
  `gap: .5rem` and `border-radius: var(--radius-selector)`.
  `.badge-soft` has a background of `color-mix(oklab, badge-color 8%, base-100)`
  and a border of `10%`. `.badge-outline` has a transparent background and a
  `currentcolor` border. All of these come from daisyUI 5, and the component
  has no `styles.css` of its own.
- Colours per theme are in `design-tokens.md` (`--color-info`/`-success`/
  `-accent`, `--color-base-content`).

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `status` | `"booked" \| "checked-in" \| "walking" \| "checked-out"` | `"booked"` | select | no |
| `size` | `"md" \| "sm"` | `"md"` | select | no |

(`size` models the mock's `extra` argument. `""` becomes `md` and `"badge-sm"`
becomes `sm`.)

## 4. States → cases

Every case has `_tier: "static"`, `_viewport: 1280`, and `_reference`
tolerance `0.005`. The tolerance is lowered because each crop is small (82–126 ×
20–24 px) and dominated by a 1em icon and a rounded border. Unsuffixed stills
use `_theme: "brand"`, the `Default theme:` line in design-tokens.md.
`-brand-dark` stills use `_theme: "brand-dark"`. The capture shot badges only
at 1280 because they do not change with the viewport. Stills are under
`fixtures/kennel-app/spec/ui/breakdown/shared-components/status-badge/screenshots/`.

| case | status | size | theme | still (px) | shows |
| --- | --- | --- | --- | --- | --- |
| `booked` | booked | md | brand | `status-badge-booked@1280.png` (94×24) | soft info "Booked" + calendar-clock (d01 Biscuit card) |
| `booked-sm` | booked | sm | brand | `status-badge-booked-sm@1280.png` (82×20) | strip size |
| `booked-dark` | booked | md | brand-dark | `status-badge-booked@1280-brand-dark.png` | |
| `booked-sm-dark` | booked | sm | brand-dark | `status-badge-booked-sm@1280-brand-dark.png` | |
| `checked-in` | checked-in | md | brand | `status-badge-checked-in@1280.png` (116×24) | soft success "Checked in" + house (d02 Juniper) |
| `checked-in-sm` | checked-in | sm | brand | `status-badge-checked-in-sm@1280.png` (101×20) | |
| `checked-in-dark` | checked-in | md | brand-dark | `status-badge-checked-in@1280-brand-dark.png` | |
| `checked-in-sm-dark` | checked-in | sm | brand-dark | `status-badge-checked-in-sm@1280-brand-dark.png` | |
| `walking` | walking | md | brand | `status-badge-walking@1280.png` (98×24) | solid accent "Walking" + footprints (d03) |
| `walking-sm` | walking | sm | brand | `status-badge-walking-sm@1280.png` (85×20) | |
| `walking-dark` | walking | md | brand-dark | `status-badge-walking@1280-brand-dark.png` | |
| `walking-sm-dark` | walking | sm | brand-dark | `status-badge-walking-sm@1280-brand-dark.png` | |
| `checked-out` | checked-out | md | brand | `status-badge-checked-out@1280.png` (126×24) | outline "Checked out" + log-out (d04 Mochi) |
| `checked-out-sm` | checked-out | sm | brand | `status-badge-checked-out-sm@1280.png` (109×20) | |
| `checked-out-dark` | checked-out | md | brand-dark | `status-badge-checked-out@1280-brand-dark.png` | |
| `checked-out-sm-dark` | checked-out | sm | brand-dark | `status-badge-checked-out-sm@1280-brand-dark.png` | |

This region's selector (`:is(.badge-info,.badge-success,.badge-accent,.badge-outline)`)
does not include the overdue badge (`badge-error`). That badge is not part of
this unit.

## 5. Events

The unit emits none: it is a non-interactive `<span>`. The build lifts these
predicate sketches, one spec per case family:

```ts
// no DOM event originates from the badge itself on hover/click
const ev = await capture(page);            // before page.goto
await page.goto(`${BASE}/components/shared-components/status-badge/walking`);
await waitHydrated(page);
await page.locator("status-badge span.badge").click();
await ev.expect(e => e.source === "span" && e.type === "click");   // bubbled click only
// ...and no custom event: expect no e where e.type not in native pointer/mouse types

// observable DOM (per status case)
await expect(page.locator("status-badge span.badge.badge-accent")).toHaveText("Walking");
await expect(page.locator("status-badge span.badge svg")).toHaveAttribute("aria-hidden", "true");
// sm cases
await expect(page.locator("status-badge span.badge")).toHaveClass(/badge-sm/);
```

## 6. Motion

None. The capture found no animations and a computed `transition: all 0s`,
and wrote no `motion.json`, filmstrip or jank.md. No case uses `_motion`.

## 7. Responsive

The badge does not change with the viewport. It has no `@media` behaviour;
`whitespace-nowrap` keeps the label on one line at every width. Hosts choose
the size: the status strip uses `sm`, while the dog card and dog heading use
`md`. Hosts also handle any reflow.

## 8. A11y

- The icon is decorative (`aria-hidden="true"`). The visible label text is the
  accessible name, so status is never carried by colour alone.
- There is no role, focus stop or keyboard handling. Hosts own focus: the strip
  `button` and the card link.
- Reduced motion does not apply because the badge has no motion.

## 9. Used on

- **board**: status-strip (`sm`, inside each `button[data-filter]`) and
  dog-card (`md`)
- **dog-detail**: dog-heading (`md`)
- **day-summary**: status-breakdown

It is shared because one STATUS map feeds all three pages.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/status-badge/`,
  containing `template.html` and no `logic.ts` or `styles.css`. Selector:
  `status-badge`.
- **Preview routes:** `/components/shared-components/status-badge/<case>`, one
  for each of the 16 cases in section 4 (verified with `sprig isolate list`:
  1 static component, 16 cases, no config errors). Each case's `_reference` is
  its row's still.
- **Tests:** the section 5 DOM assertions go in
  `cases/<status>/tests/status-badge.spec.ts` for each status family, and the
  `badge-sm` assertion goes in `cases/<status>-sm/tests/`. The pixel check
  comes from the `_reference` rows.
- **Loop:** scaffold the folder → copy in `isolate/` → run
  `sprig isolate test --root fixtures/kennel-app --json` (the 16 `reference:`
  rows are the diff) → lift the section 5 assertions into tests → run →
  iterate until green, then compose into status-strip, dog-card, dog-heading
  and status-breakdown.
