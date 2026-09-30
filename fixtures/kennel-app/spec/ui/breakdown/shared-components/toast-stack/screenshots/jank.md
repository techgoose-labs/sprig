# toast-stack — jank

Live samples (headless Chromium, 1280x800, dsf 1, `#/summary`):

| run | frames | dropped (>25 ms) | max frame | LoAF > 50 ms | CLS |
|---|---|---|---|---|---|
| entrance: `toast("Day closed — ledger locked.","success")`, 900 ms window | 72 | 0 % | 16.8 ms | none | 0 |
| lifetime + removal: following 3200 ms window (toast removed by `setTimeout(el.remove, 3500)`; 0 toasts left after) | 419 | 0.5 % | 33.4 ms | none | 0 |

## Static lints

| finding | where | rebuild fix |
|---|---|---|
| entrance keyframes `toast` animate `opacity` 0→1 + `scale` .9→1, 250 ms ease-out | `css/toast-stack.matched.css` (`.toast > *`, reduced-motion gated) | compositor-friendly — no fix needed |
| no exit animation: `el.remove()` after 3500 ms — the toast vanishes in one frame and remaining stacked toasts jump (container is `position: fixed`, so CLS reads 0 but the stack visibly snaps) | `js/toast-stack.js` line `setTimeout(() => el.remove(), 3500)` | keep the timer for lifetime only; on expiry add an exit class (opacity/scale out) and remove on `animationend`; animate siblings with `transform` (FLIP) if a smooth restack matters |
| every `toast()` calls `lucide.createIcons()`, which rescans the whole document | `js/toast-stack.js` | rebuild renders its icon inline (component template) — no global rescan |
