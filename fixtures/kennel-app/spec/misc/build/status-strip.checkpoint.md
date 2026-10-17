# status-strip checkpoint (r2 successor, after the 05c font re-pin)

- GREEN: all 4 case specs (default/links, active-walking/active, hover-booked/hover, empty/empty); `sprig check` green, no finding in the folder.
- RED: 9 `_reference` rows, measured 0.041–0.111 vs tolerance 0.01 (evidence /tmp/wb-8798/evidence/2026-09-29T19-21-15-144Z-utyy). Before the font re-pin, the same rows measured 0.060–0.147.
- Root cause (pixel classifier run on all 9 actual.png files against their stills): 0 glyph, border or geometry differences. Every differing pixel is the workbench stage colour (243,238,226) showing through the 12px grid gaps and outside the 20px card radii, where the still has the board page bg base-200 (243,234,219). The rest is the anti-aliased fringe on those rounded corners (≤0.0007; in the dark case 0.0053, because the dark card blends against the light stage). This is the known runner defect (see the cheatsheet ISOLATE STAGE line). Per the cheatsheet, tolerance is NOT widened for it.
- RULED OUT: fonts (fixed by the 05c re-pin; the badge/count rows now match), text colour, size/layout, and card border/radius.
- NEXT STEP: fix the runner so that the stage paints the fixture background / `_theme` page bg. After that, no change to the unit should be needed.
