# day-closed-alert — live jank sample (one labeled run)

No motion of its own: `getAnimations()` after the close reply = [] and its computed transition/animation are none.
It appears by a full `#app` `innerHTML` re-render when `day.close` replies `closed: true`.

| Viewport | Reply | Dropped frames | Max frame | CLS (API) | Visual push-down of content below |
|---|---|---|---|---|---|
| 1280×900 | 89 ms | 0 % | 16.8 ms | 0 | 66 px (alert 46 px + mb-5 20 px) |
| 375×812 | 76 ms | 0 % | 16.8 ms | 0 | 86 px (alert wraps to 66 px + 20 px) |

CLS reads 0 only because every node is recreated (Layout Instability can't track new nodes).
Rebuild fix: insert the alert without rebuilding its siblings and give it an entrance
(`grid-template-rows: 0fr→1fr` wrapper or `opacity`+`translateY` with the theme's `brand-rise`, 320 ms `--ease-bounce`)
so the stats/cards don't hard-jump; honour `prefers-reduced-motion`.
