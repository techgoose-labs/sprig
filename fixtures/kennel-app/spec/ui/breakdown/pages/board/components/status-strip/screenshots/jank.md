# status-strip — jank (one labeled live sample, headless Chromium, 1280x800, DPR 1, #/board; not a benchmark)

| Run | Frames | Dropped (>25ms) | Max frame | LoAF >50ms | CLS |
|---|---|---|---|---|---|
| Hover across the 4 cards (booked → checked-out), 300ms each | 84 | 0% | 16.8ms | none | 0 |
| Click `walking` (filter on) then click again (toggle back to all) | 54 | 0% | 16.8ms | none | 0 |

## Static lints (`css/status-strip.css`, `js/status-strip.js`)

| Finding | Where | Rebuild fix |
|---|---|---|
| none blocking. Hover transition is `transition-colors` (explicit property list, 150ms, cubic-bezier(0.4,0,0.2,1)) — only `background-color` actually changes (#FBF7F0 → #F3EADB in brand) | `button[data-filter].hover:bg-base-200.transition-colors` | keep: colour transitions are paint-only and cheap at 4 elements |
| Selection (`border-primary`) is applied by re-rendering all of `#app`; no transition on border-color because the node is recreated | `statusStrip()` + delegated click | rebuild: same visual; if animating the border change is wanted, keep the node and toggle a class |
| daisyUI `.card { transition: outline .2s }` is overridden by `.transition-colors` (computed transition-property is the colour list) | — | note only |
