# toast-stack checkpoint (r3, port 8799)

Green (5): motion entrance; E1 empty; E2 page-context; E3 auto-dismiss; E4 stacked order. `sprig check` green (exit 0).
Red (6 `_reference` rows), ALL residue is page-background (known runner defect: headless stage paints #f3eee2, ignores fixture bg/_theme):
error-1280 0.017 (bg 0.0169, non-bg 0) · error-375 0.018 (bg 0.0177, non-bg 2px) · error-1280-brand-dark 0.022 (bg 0.0209, non-bg 0.0011 = AA border/corner px over dark page)
stacked-1280 0.072 (bg 0.0719 — the 8px inter-alert gap + corners) · stacked-1280-brand-dark 0.091 (bg 0.0900, non-bg 0.0009 AA edge) · success-1280 0.029 (bg 0.0290, non-bg 0)

r3 fixes (non-bg): (1) success icon path now lucide@latest (v1.48) circle-check `m16 9-5.5 5.5L8 12` (was the pre-1.x `m9 12 2 2 4-4`; 27 icon px differed). (2) error-1280-brand-dark case message → "The day couldn't be closed — nothing changed." — the still shows that text, not the Biscuit message the spec table names (breakdown table is wrong).
Ruled out: fonts (05c re-pin: light error rows went 0.096 → 0.017, text pixels now identical).
Next step: fix the runner's stage background (or apply fixture background/_theme) — then these rows should go green with no unit change.
