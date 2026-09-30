# dog-heading — jank (one labeled live sample, not a benchmark)

No animation: `document.getAnimations()` is `[]` at settle and `[]` again right after the status flip. The status change is an instant full re-render (`runStatus` → `render()` → `innerHTML`). Nothing tweens, so there is no motion.json or filmstrip.

Run: headless Chromium, 1280x900, theme brand, `#/dog/d01`. Clicked "Check in"; the POST /commands reply was mocked by the capture script so no event was written to the host. Observed 800 ms.

| metric | value |
|---|---|
| frames sampled | 101 |
| dropped frames (>25 ms) | 0.0 % |
| max frame time | 16.8 ms |
| long-animation-frame entries > 50 ms | 1 (68.2 ms — buffered, initial render) |
| CLS | 0.0001 |

## Static lint findings
- CSS: none (css/dog-heading.rules.css has no transition/keyframe hits).
- JS: none of the checklist patterns.
