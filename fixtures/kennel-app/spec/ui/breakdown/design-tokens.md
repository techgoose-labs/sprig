# Design tokens — Kennel board

Source: `spec/ui/kennel-prototype/_test-prototype.html` `<style>` block (the
inlined Hearth `theme.cdn.css`, byte-identical to
`spec/ui/design-system/theme.css`) + the Tailwind utility classes the mock uses.
Every value below was read from source, not invented.

Default theme: brand

(The mock sets `<html data-theme="brand">` and its script calls
`setTheme(params.get("theme") || "brand")`; `brand-dark` is reached only via the
top-bar theme toggle or `?theme=brand-dark`. **Drift to reconcile at build:** the
app scaffold's `src/css-variables.json` declares `"default": "brand-dark"` and
`src/shell/styles.css` sets `color-scheme: dark` / `body` on `base-100` — the
mock renders light `brand` by default and paints `body` with `bg-base-200`.)

## Palette — every theme as parallel columns

| token | brand (light, default) | brand-dark | role in the mock |
| --- | --- | --- | --- |
| `--color-base-100` | `#FBF7F0` | `#1E1712` | top bar, cards, stats surface |
| `--color-base-200` | `#F3EADB` | `#29201A` | page (`body.bg-base-200`), card hover |
| `--color-base-300` | `#E6D7C3` | `#3A2E24` | 1px borders, dividers |
| `--color-base-content` | `#3B2A1E` | `#F1E7D9` | ink; muted ink at `/70`, `/60`, `/40`, `/10` (dividers) |
| `--color-primary` | `#C2410C` | `#EA7A45` | brand dog icon, selected status card border, Check in / Check out / Close the day CTA |
| `--color-primary-content` | `#FFF8F1` | `#2A1206` | text on primary |
| `--color-secondary` | `#5E6B47` | `#93A179` | soft secondary action buttons, occupancy progress + stat icon |
| `--color-secondary-content` | `#FBF7F0` | `#1B1611` | |
| `--color-accent` | `#DA9A3E` | `#E8B25E` | `walking` badge + progress |
| `--color-accent-content` | `#3B2A1E` | `#2A1F0E` | |
| `--color-neutral` | `#43342A` | `#2C231C` | "Day closed" badge |
| `--color-neutral-content` | `#FBF3E9` | `#F1E7D9` | |
| `--color-info` | `#3F7E8C` | `#5FA6B5` | `booked` badge (soft) + progress |
| `--color-info-content` | `#FBF7F0` | `#0E1B1E` | |
| `--color-success` | `#4E7A2F` | `#84B85A` | `checked-in` badge (soft) + progress, revenue icon, success toast / closed alert |
| `--color-success-content` | `#FBF7F0` | `#14210C` | |
| `--color-warning` | `#D97706` | `#E8A53E` | (declared, unused in the mock) |
| `--color-warning-content` | `#3B2A1E` | `#2A1E08` | |
| `--color-error` | `#C0392B` | `#E06A5C` | overdue badge, overdue card border, overdue stat icon, error toast / load-error alert |
| `--color-error-content` | `#FFF6F4` | `#2A0E0A` | |
| `color-scheme` | `light` | `dark` | |

Derived shade tokens (theme-independent formulas, `:root`):
`--color-base-content-30/50`, `--color-primary-30/15`, `--color-secondary-30`,
`--color-accent-30` = `color-mix(in oklch, var(<base>) N%, transparent)`.
Declared, not referenced by the mock's own markup (it uses Tailwind `/NN`
opacity modifiers instead).

## Type

| token | value | use in the mock |
| --- | --- | --- |
| `--font-display` | `'Caveat', 'Comic Sans MS', system-ui, cursive` | `h1–h4`, `.font-display` (wordmark, page titles, card titles), weight **700**, `letter-spacing: var(--tracking-display)`, `line-height: var(--leading-tight)` |
| `--font-body` | `'Quicksand', system-ui, sans-serif` | `body` |
| `--font-mono` | `ui-monospace, 'SF Mono', Menlo, monospace` | kennel badge (`font-mono`) |
| Google Fonts | `Caveat:wght@400;500;600;700`, `Quicksand:wght@300;400;500;600;700` | `@import` at top of the style block |
| `--step--2` | `0.64rem` | |
| `--step--1` | `0.8rem` | |
| `--step-0` | `1rem` | |
| `--step-1` | `1.25rem` | |
| `--step-2` | `1.5625rem` | |
| `--step-3` | `1.9531rem` | |
| `--step-4` | `2.4414rem` | |
| `--step-5` | `3.0518rem` | |
| `--leading-tight/snug/normal/relaxed` | `1.1 / 1.25 / 1.5 / 1.6` | |
| `--tracking-display` | `-0.015em` | |
| `--measure` | `65ch` | |

Tailwind text sizes the markup actually uses: `text-xs`, `text-sm`, `text-base`,
`text-2xl` (wordmark mobile, card titles), `text-3xl` (wordmark ≥md, strip
counts, empty-state heading, total due), `text-4xl` (page `h1`), `md:text-5xl`
(dog name on detail). Weights: `font-semibold`, `font-bold`, `font-normal`.
Numerals: `tabular-nums` on every count / money / time / phone.

## Spacing, layout, radii, shadows

- Container: `main` `max-w-7xl mx-auto p-3 md:p-6` (80rem).
- Top bar: `px-3 md:px-6 gap-2`, sticky `top-0`, `border-b border-base-300`.
- Gaps: `gap-1` (nav), `gap-2`, `gap-3` (strip, heading rows), `gap-4` (card
  grids); card bodies `p-4` on board cards/strip, daisyUI default elsewhere.
- Vertical rhythm: `mb-3`, `mb-4`, `mb-5`, `mb-6`, `mt-1`, `mt-2`, `mt-10`
  (error / not-found cards), `py-2`, `py-3`, `py-12`, `py-16` (empty states).
- Radii (daisyUI params, same in both themes): `--radius-selector: 1rem`,
  `--radius-field: 0.75rem`, `--radius-box: 1.25rem` (`rounded-box`).
- daisyUI params: `--size-selector: 0.25rem`, `--size-field: 0.25rem`,
  `--border: 1px`, `--depth: 1`, `--noise: 1`.
- Shadows: `shadow-sm` (dropdown panel, toasts, `hover:shadow-sm` on dog cards).
- Borders: `border` / `border-dashed` (empty states) on `base-300`; state
  borders `border-primary` (selected strip card), `border-error` (overdue dog).

## Motion

| token | value |
| --- | --- |
| `--ease-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `--ease-standard` | `cubic-bezier(0.20, 0, 0, 1)` |
| `--dur-micro` | `120ms` |
| `--dur-fast` | `200ms` |
| `--dur-base` | `320ms` |
| `@keyframes brand-rise` | `from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none }` |
| `.animate-rise` | `animation: brand-rise var(--dur-base) var(--ease-bounce) both` (declared; not applied by the mock's markup) |

Utility transitions in markup: `transition-colors` (status strip cards,
`hover:bg-base-200`), `transition-shadow` (dog cards). daisyUI-owned motion:
`swap-rotate` (theme toggle), `loading-spinner`, `skeleton` pulse.

**`prefers-reduced-motion: reduce`** → `*, *::before, *::after {
animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }`
— carry verbatim into the global block.

## z-index

| layer | value |
| --- | --- |
| top bar (`header.navbar`, sticky) | `z-30` |
| dropdown panel | `z-40` |
| toast stack (`#toasts`) | `z-50` (+ `mb-12`) |

## Breakpoints (the mock's real ones)

Only Tailwind v4 defaults are used — no custom `@media` width queries in the
source (its single `@media` is `prefers-reduced-motion`).

| prefix | min-width | used for |
| --- | --- | --- |
| `sm` | 640px (40rem) | nav labels show; dog grid 2 cols; action buttons row + `w-auto` |
| `md` | 768px (48rem) | page/top-bar padding; wordmark `text-3xl`; strip 4 cols; stats horizontal; note form row; dog name `text-5xl` |
| `lg` | 1024px (64rem) | dog grid 3 cols; detail 3-col grid (notes `col-span-3`); actions column; summary 2-col grid |
| `xl` | 1280px (80rem) | dog grid 4 cols |

Capture widths that exercise every layout: **375, 640, 768, 1024, 1280**.

## Proposed Tailwind v4 `@theme` mapping

For `src/shell/styles.css` (or generated from `src/css-variables.json`). Tokens
are CSS custom properties in a `:global(...)` block — not a
`tailwind.config.js`, not daisyUI themes. daisyUI components stay in the build
(`@plugin "daisyui"`, themes off) and read these same `--color-*`/`--radius-*`
variables, so the mock's daisyUI markup (`btn`, `card`, `badge`, `tabs`,
`stats`, `progress`, `alert`, `toast`, `navbar`, `swap`, `skeleton`, `loading`,
`divider`, `input`, `link`) can be used by its own names. Own classes must be
prefixed (e.g. `kb-`), never a daisyUI name.

```css
@theme {
  --font-display: 'Caveat', 'Comic Sans MS', system-ui, cursive;
  --font-body: 'Quicksand', system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-standard: cubic-bezier(0.20, 0, 0, 1);
  --radius-box: 1.25rem;
  --radius-field: 0.75rem;
  --radius-selector: 1rem;
  /* default theme = brand (light) */
  --color-base-100: #FBF7F0;  --color-base-200: #F3EADB;  --color-base-300: #E6D7C3;
  --color-base-content: #3B2A1E;
  --color-primary: #C2410C;   --color-primary-content: #FFF8F1;
  --color-secondary: #5E6B47; --color-secondary-content: #FBF7F0;
  --color-accent: #DA9A3E;    --color-accent-content: #3B2A1E;
  --color-neutral: #43342A;   --color-neutral-content: #FBF3E9;
  --color-info: #3F7E8C;      --color-info-content: #FBF7F0;
  --color-success: #4E7A2F;   --color-success-content: #FBF7F0;
  --color-warning: #D97706;   --color-warning-content: #3B2A1E;
  --color-error: #C0392B;     --color-error-content: #FFF6F4;
}
:global(:root) {
  --step--2: 0.64rem; --step--1: 0.8rem; --step-0: 1rem; --step-1: 1.25rem;
  --step-2: 1.5625rem; --step-3: 1.9531rem; --step-4: 2.4414rem; --step-5: 3.0518rem;
  --leading-tight: 1.1; --leading-snug: 1.25; --leading-normal: 1.5; --leading-relaxed: 1.6;
  --tracking-display: -0.015em; --measure: 65ch;
  --dur-micro: 120ms; --dur-fast: 200ms; --dur-base: 320ms;
}
:global([data-theme="brand-dark"]) {
  color-scheme: dark;
  --color-base-100: #1E1712;  --color-base-200: #29201A;  --color-base-300: #3A2E24;
  --color-base-content: #F1E7D9;
  --color-primary: #EA7A45;   --color-primary-content: #2A1206;
  --color-secondary: #93A179; --color-secondary-content: #1B1611;
  --color-accent: #E8B25E;    --color-accent-content: #2A1F0E;
  --color-neutral: #2C231C;   --color-neutral-content: #F1E7D9;
  --color-info: #5FA6B5;      --color-info-content: #0E1B1E;
  --color-success: #84B85A;   --color-success-content: #14210C;
  --color-warning: #E8A53E;   --color-warning-content: #2A1E08;
  --color-error: #E06A5C;     --color-error-content: #2A0E0A;
}
:global(body) { font-family: var(--font-body); }
:global(h1), :global(h2), :global(h3), :global(h4) {
  font-family: var(--font-display); font-weight: 700;
  letter-spacing: var(--tracking-display); line-height: var(--leading-tight);
}
@media (prefers-reduced-motion: reduce) {
  :global(*), :global(*::before), :global(*::after) {
    animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
  }
}
```

Icons: Lucide (`data-lucide` names used: `dog`, `layout-grid`,
`chart-no-axes-column`, `sun`, `moon`, `flask-conical`, `calendar-clock`,
`house`, `footprints`, `log-out`, `log-in`, `alarm-clock`, `circle-alert`,
`circle-check`, `wifi-off`, `user`, `clock`, `bone`, `search-x`, `lock`,
`arrow-left`, `paw-print`, `bed-double`, `list-checks`, `notebook-pen`, `plus`,
`warehouse`, `banknote`) — inline SVG in the build (no runtime `lucide.createIcons()`).
