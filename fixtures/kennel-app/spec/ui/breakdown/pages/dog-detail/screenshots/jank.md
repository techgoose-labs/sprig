# dog-detail — jank (one labeled live sample, not a benchmark)

At settle `document.getAnimations()` is empty: no entrance or infinite animation. The only motion is the hover transitions on daisyUI `.btn` (see motion.json + filmstrip.png).

Run: headless Chromium, 1280x900, theme brand. Instrumented through addInitScript before navigation. Cold load of `#/dog/d01`, covering the loading skeleton (fake 450 ms latency), the content swap, and a 1.2 s settle.

| metric | value |
|---|---|
| frames sampled | 101 |
| dropped frames (>25 ms) | 0.0 % |
| max frame time | 16.8 ms |
| long-animation-frame entries > 50 ms | 1 (77.8 ms — initial render) |
| CLS | 0.0001 (the skeleton→content swap is an innerHTML replacement, so replaced nodes do not count as shifts) |

## Motion (extracted)
- Trigger: hover `a.btn.btn-ghost` (the Back "Board" link). CSSTransitions `background-color`, `border-{top,right,bottom,left}-color`, and `box-shadow`, each 200 ms, `cubic-bezier(0, 0, 0.2, 1)`. bg goes transparent → base-200 tint `oklab(0.874 0.003 0.020)`.
- Trigger: hover `button.btn.btn-primary` (Check in). The same property set, 200 ms, `cubic-bezier(0, 0, 0.2, 1)`. bg goes `rgb(194,65,12)` → `oklab(0.515 0.127 0.100)` (darker terracotta). The box-shadow keyframes change the tinted drop layers. The capture also holds the Back link's reverse transition, because the pointer left it.

## Static lint findings
- **Animated `box-shadow`**: daisyUI `.btn` has `transition-property: color, background-color, border-color, box-shadow, transform` (css/dog-detail.rules.css). Rebuild: keep the color transitions. Put the btn shadow on a pseudo-element and fade its `opacity`, or drop box-shadow from the transition list.
- JS: `setTimeout(…, 450)` in `setDemo` is fake latency, not animation. `setTimeout(() => el.remove(), 3500)` in `toast` is a dismissal timer, not animation. No layout reads in scroll/rAF handlers. The `hashchange` handler only calls `scrollTo(0,0)` + `render()`. No checklist hits.
