# Typography selection (font pairing + type scale)

The fonts are half the brand. Don't hand-pick from memory — models default to
the same few faces (Space Grotesk, Inter, Roboto), which is exactly what
`prototype`'s design-lint warns against. Use a typography selector to get a
principled, vibe-matched, **contrast-classified** pairing and a modular scale,
then drop the result into `theme.css`. This is the same move as using the
daisyUI MCP for the theme — offload the lookup to a tool that knows the catalog.

## Primary: the google-fonts MCP (mirrors the daisyUI MCP pattern)

Install once (needs `uv`):
`claude mcp add google-fonts -- uvx google-fonts-mcp`. Tools: `search_fonts`,
`list_pairings`, `generate_typography_system`, `list_scales`, `lookup_font`. It
indexes ~1,923 Google Fonts tagged by **personality / mood / use-case**, 73
proven **pairings with contrast classification**, and 8 modular scales
(minor-second → golden-ratio).

Use it:

1. From the brand vibe, `search_fonts` / `list_pairings` → choose a **display +
   body** pair with obvious contrast (the two faces must read as clearly
   different, not lookalikes).
2. `list_scales` → pick a scale that fits density (tight UI = smaller ratio;
   hero/marketing = larger).
3. `generate_typography_system` → it emits **CSS custom properties (font-family
   vars + a `--step-*` scale) + the Google Fonts embed link**. Take those and
   the embed; **ignore its Tailwind config** (we're CSS-first / daisyUI). Keep
   the `--font-display` / `--font-body` names the skill uses.

## Alternative: font-mcp (vibe & reference-URL research)

`Microck/font-mcp` (Node 18+, clone + `npm install` + `npm run build`). Tools:
`consult_font_expert` (vibe → pairing), `analyze_website` (reverse-engineer the
type of a reference site URL), `analyze_project_and_recommend`,
`setup_font_config`. It picks via **live research** (Reddit r/typography,
Typewolf, FontsInUse). Reach for it when the brief gives a vibe word ("luxury",
"editorial") or — especially — a **reference site URL** to match.

## No-MCP fallback (the skill still works without either)

If no typography MCP is connected, pick the pairing by hand with these rules:

- **Obvious contrast** between display and body (serif × sans, or geometric ×
  humanist — not two similar grotesques).
- **Never** Inter / Roboto / system as the body default (design-lint
  `overused-font`).
- **Match the vibe:** geometric/grotesque → modern/tech; humanist serif →
  calm/editorial; condensed/chunky → bold/energetic; rounded → friendly/playful.
- Sanity-check against **Typewolf** (typewolf.com) — real-world pairings tagged
  by industry.
- Author the `--step--2 … --step-5` scale by hand on a 1.2–1.25 ratio.

## What lands in `theme.css` (whatever the source)

`--font-display`, `--font-body` (+ the Google Fonts `@import`/`<link>`), and the
`--step--2 … --step-5` modular scale. The pairing's contrast class informs how
big a jump to put between display and body sizes — high-contrast pairings can
carry a larger display step.
