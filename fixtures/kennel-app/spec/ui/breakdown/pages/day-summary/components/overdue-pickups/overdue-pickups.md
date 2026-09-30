# overdue-pickups

`<overdue-pickups>` — the "Overdue pickups" card on the day summary. It lists every dog the server has flagged overdue, with its kennel, its owner's name and phone, and how long the pickup is overdue. Page-local to `day-summary`.

Evidence: `screenshots/` (9 stills), `source.html` (live DOM at `#/summary`, 1280, theme `brand`), `js/overdue-pickups.js` (the render code, reference only), `css/matched-rules.css` (42 matched rules).

## 1. Classification & behavior

- **Bucket:** `static` (a component folder, no `logic.ts`). The analyst's call, kept.
- **Interaction tier:** `static`. The only interaction is the dog-name link, which is plain navigation (`href="#/dog/<id>"` in the mock; the app's dog-detail route in the build). There are no writes, no client state and no signals.
- **Data source:** resolve → the `overduePickups` query, `GET /api/dogs?overdue=true` (data-model.md → Reads). Each row carries dog `id, name, kennel, overdue, overdueBy` plus the owner's `name, phone`. The page (`day-summary`) resolves the query and passes the rows in as the `pickups` prop.
  - **The rows come from the server flag, not a client filter.** The mock filters `dog.filter(d => d.overdue)` over the whole collection. data-model.md hazard 3 forbids that in the build: the unit renders the rows exactly as the query returns them, in that order, with no filtering, sorting or date math.
  - **Owner is part of the row.** data-model.md hazard 1: the build never loads the owner collection to join. The owner's name and phone arrive on the row. The mock's fallback `Unknown owner` (when the owner is missing) applies to the name; the phone then renders empty.
- **Honest empty:** when the list is empty, the body is the italic line `No overdue pickups — every owner is on time.` in place of the list (the `empty` cases).
- **Liveness:** request-response. Nothing is pushed. The list changes only on a fresh resolve (a page load or navigation back to the summary).
- **Loading / error:** none at this unit. The page resolves the data before render, so the unit never shows a loading or error state of its own. The page's loading/error stills belong to `day-summary`.
- **Data-shape hazard:** `overdueBy` is optional (`string?`, present only when `overdue`). Without it the badge reads just `Overdue` (the mock's `Overdue${d.overdueBy ? " · " + overdueBy : ""}`). Both captured rows carry it.

## 2. Anatomy

```
<overdue-pickups>
  section  daisyUI `card` bg-base-100 border border-base-300            (radius --radius-box, 1px base-300 border)
    div    daisyUI `card-body`                                           (padding 1.5rem, gap .5rem, column)
      h2   daisyUI `card-title` text-2xl                                 (display font, 700, gap .5rem)
        icon  lucide alarm-clock, size-5 (20px), decorative
        "Overdue pickups"
      ── when pickups.length > 0 ──
      ul   overdue-pickups-list   (divide-y: 1px rule between rows)
        li overdue-pickups-row    py-3 flex flex-wrap items-center gap-2   (one per pickup, server order)
          a     overdue-pickups-dog   daisyUI `link link-hover` font-semibold min-w-0 break-words   → dog-detail(<id>)   "<name>"
          span  daisyUI `badge badge-outline` font-mono                                            "<kennel>"
          span  overdue-pickups-owner  text-sm text-base-content/70 min-w-0                         "<owner.name> · " + span.tabular-nums "<owner.phone>"
          span  overdue-pickups-flag   ml-auto
            span daisyUI `badge badge-error` whitespace-nowrap
              icon lucide alarm-clock, size 1em, decorative
              "Overdue · <overdueBy>"   (just "Overdue" when overdueBy is absent)
      ── when pickups.length === 0 ──
      p    overdue-pickups-empty  text-base-content/60 italic py-3   "No overdue pickups — every owner is on time."
```

- daisyUI components kept on purpose: `card`, `card-body`, `card-title`, `badge` + `badge-outline`, `badge` + `badge-error`, `link` + `link-hover`. The unit's own parts use the `overdue-pickups-` prefix and never a daisyUI name.
- No slots and no projected children.
- **Divider colour (match the still).** The mock's markup asks for `divide-base-content/10` (a faint tint). The stills show a solid line instead: dark `base-content` in `brand` and light in `brand-dark`. `css/matched-rules.css` has the `divide-y` width rule but **no** `divide-base-content/10` colour rule, so the border takes `currentColor`. The cause is inferred from that missing rule; the capture agent did not check the computed `border-color`. The `_reference` cases pin what the still shows, a 1px line in the text colour. To use the intended 10% tint instead, recapture the stills; don't raise the tolerance.

## 3. Props table

| name | type | default | control widget | signal? |
|---|---|---|---|---|
| `pickups` | `Array<{ id: string; name: string; kennel: string; overdue: boolean; overdueBy?: string; owner: { name: string; phone: string } }>` | `[]` | none (JSON array; set per case as a bare key) | no |

The card title and the empty line are fixed copy, not props. `isolate/fixture.json` declares no controls, because the control widgets have no array type (see Gaps). Each case pins `pickups` as a bare prop instead.

## 4. States → cases

Every case has `_tier: "static"`. Unsuffixed stills use `_theme: "brand"`, the mock's default (`design-tokens.md` → `Default theme: brand`). `-brand-dark` stills use `_theme: "brand-dark"`. `_reference` paths are git-root-relative: `fixtures/kennel-app/spec/ui/breakdown/pages/day-summary/components/overdue-pickups/screenshots/…`.

The populated cases carry the two captured rows:

| id | name | kennel | owner.name | owner.phone | overdueBy |
|---|---|---|---|---|---|
| d14 | Rocco | K14 | Oliver Brandt | (555) 0113-4481 | 2h 15m |
| d18 | Olive | K18 | Elena Popescu | (555) 0117-4629 | 45m |

| case | state | `_viewport` | `_theme` | `_reference` still (size) | tolerance |
|---|---|---|---|---|---|
| `default` | two overdue rows, single-line, badge right-aligned | 1280 | brand | `overdue-pickups@1280.png` (608×235) | 0.005 (pins the 1px divider) |
| `w375` | rows wrap; badge drops to its own line, right-aligned | 375 | brand | `overdue-pickups@375.png` (351×274) | 0.01 |
| `w640` | rows stop wrapping, single line each | 640 | brand | `overdue-pickups@640.png` (616×182) | 0.01 |
| `w768` | single-line rows, md page padding | 768 | brand | `overdue-pickups@768.png` (720×182) | 0.01 |
| `w1024` | half-width column; rows wrap | 1024 | brand | `overdue-pickups@1024.png` (480×246) | 0.01 |
| `dark-375` | the `w375` layout in brand-dark | 375 | brand-dark | `overdue-pickups@375-brand-dark.png` (351×274) | 0.01 |
| `dark-1280` | the `default` layout in brand-dark (light divider) | 1280 | brand-dark | `overdue-pickups@1280-brand-dark.png` (608×235) | 0.005 |
| `empty` | honest empty: italic line, no list | 1280 | brand | `overdue-pickups-empty@1280.png` (608×235) | 0.01 |
| `empty-375` | honest empty at mobile width | 375 | brand | `overdue-pickups-empty@375.png` (351×130) | 0.01 |

No `pending` or `rolled-back` case, because the unit isn't `optimistic-write`. No hover case, because `link-hover` only toggles the underline, instantly, and no still was captured of it.

**Grid-stretch heights (verify during build).** On the page, the 1280 cards sit in a two-column grid that stretches this card to its neighbour's height. That makes `default`, `dark-1280` and `empty` 235px tall, while the unit's natural height is about 182 (`w640`/`w768`) or about 130 (`empty-375`). The runner lays the unit out at its natural height, so these three rows are expected to fail with **size mismatch** (more than 4px apart). This is not a fidelity drift. `w1024` (246) may have the same stretch, which wasn't proven. Resolve it in the build, don't paper over it with tolerance: either recapture those stills with the card out of the grid, or give the case's still a crop to natural height.

## 5. Events

The component emits nothing of its own. The only bridge event is the native link click. `source` is `a` because the link has no id.

- Clicking the dog name navigates to that dog's detail:
  `ev.expect(e => e.source === "a" && e.type === "click" && /Rocco/.test(String(e.detail)))`
  Observable effect: `expect(page.locator("overdue-pickups a", { hasText: "Rocco" })).toHaveAttribute("href", /dog.*d14/)`, and likewise Olive → `d18`.
- The rows render in server order with the exact copy:
  `expect(page.locator("overdue-pickups li")).toHaveCount(2)`; first row contains `Rocco`, `K14`, `Oliver Brandt · (555) 0113-4481`, `Overdue · 2h 15m`; second contains `Olive`, `K18`, `Elena Popescu · (555) 0117-4629`, `Overdue · 45m`.
- Honest empty:
  `expect(page.locator("overdue-pickups")).toContainText("No overdue pickups — every owner is on time.")` and `expect(page.locator("overdue-pickups ul")).toHaveCount(0)`.

## 6. Motion

None extracted, so there is no `motion.json` for this unit and no `_motion` case.

- The dog link is `link link-hover`: the underline appears on hover **instantly**, with no transition.
- daisyUI's `.card` carries `transition: outline .2s ease-in-out`, but nothing in the mock focuses the card or changes its outline, so it never runs.
- Jank: none (capture group 5). No filmstrip for this unit.

## 7. Responsive

The unit has no `@media` of its own. Its width comes from the page, which uses the Tailwind defaults:

- `< 768` (375, 640): the page has `p-3` padding and one card column. At 375 the row content wraps (`flex-wrap`): the name, kennel badge and owner go on the first line(s), and the overdue badge (`ml-auto`) wraps to its own line, right-aligned. At 640 each row fits on one line.
- `md` 768: the page padding becomes `p-6`. Still one column, single-line rows.
- `lg` ≥ 1024: the page grid goes to two columns. At 1024 the half column (480) wraps the rows again. At 1280 (608) the rows fit on one line. The card stretches to its neighbour's height, as described in section 4.
- `min-w-0` + `break-words` on the name and `min-w-0` on the owner span let long values wrap instead of overflowing. `whitespace-nowrap` keeps the overdue badge on one line.

## 8. A11y

- `section` labelled by its heading: give the `h2` an id and set `aria-labelledby` on the section, so it reads as the "Overdue pickups" region. Keep the heading at `h2`, matching the page's card headings.
- Both alarm-clock icons are decorative: `aria-hidden="true"`. The badge text "Overdue · 2h 15m" carries the meaning, not the colour.
- A list of rows as `ul`/`li`. The link's accessible name is the dog's name. The phone is plain text; the mock doesn't make it a `tel:` link.
- Keyboard: tab order is one stop per dog link, in row order. Nothing is trapped and there are no custom keys.
- Reduced motion: nothing to reduce.
- Contrast: owner text is `base-content` at 70% and the empty line at 60%. Verify both against `base-100` in both themes during build.

## 9. Used on

- `day-summary` only: the right-hand card at ≥ 1024, and the second card when stacked. It is page-local (the analyst's evidence: its rows come from the `?overdue=true` query that only this page resolves).
- No channels. It neither sets nor reads `day`, `dog` or `toasts`.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/day-summary/components/overdue-pickups/` (`template.html` + `styles.css`, no `logic.ts`). Selector `<overdue-pickups>`.
- **Preview routes** (from `isolate/fixture.json`: `category` `day-summary`, `folder` `overdue-pickups`): `/components/day-summary/overdue-pickups/<case>` for `default`, `w375`, `w640`, `w768`, `w1024`, `dark-375`, `dark-1280`, `empty`, `empty-375`.
- **Per case:** see the table in section 4. Each case carries its `_reference` still, which is its pixel diff.
- **Events → tests:**
  - `cases/default/tests/rows.spec.ts`: the row count, copy and order row, plus the dog-link `href` rows for Rocco → d14 and Olive → d18.
  - `cases/w375/tests/wrap.spec.ts`: the overdue badge's box sits below the name's box (the wrap). Optional; the `_reference` already pins it.
  - `cases/empty/tests/empty.spec.ts`: the honest-empty rows (text present, no `ul`).
- **Loop:** scaffold the folder, then drop in `isolate/`, then run `sprig isolate test --root fixtures/kennel-app --json` (the `reference:` rows are the diff). Then lift the Events above into the `tests/*.spec.ts` files above (plain `@playwright/test`, `ISOLATE_BASE_URL`), run, and iterate until green. Only then compose it into `day-summary`, passing `pickups` from the page's `overduePickups` resolve.
- **Expected non-fidelity reds:** the three 1280 cases (`default`, `dark-1280`, `empty`) show a size mismatch from the grid stretch (section 4). Fix the stills or the crop; don't loosen the tolerance.

## Gaps

- **Props → controls:** `pickups` is an array, and no control widget accepts one, so `fixture.json` has no controls. A reviewer can't edit rows live in the workbench; the cases carry them. Described, not extracted — verify during build.
- **Divider colour:** the cause of the solid line (no `divide-base-content/10` rule in the matched CSS, so it falls back to `currentColor`) is inferred, not measured. Described, not extracted — verify during build.
- **Stretched 1280 stills (and maybe 1024):** these are page-grid heights, not the unit's own. Described, not extracted — verify during build.
- **`overdueBy` absent / missing owner:** no still exists. The copy (`Overdue`, `Unknown owner`) comes from `js/overdue-pickups.js`. Described, not extracted — verify during build.
