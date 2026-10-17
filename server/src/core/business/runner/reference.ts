// The reference compare behind a case's `_reference` (REQ-042): the fraction of
// pixels that differ between the rendered case and the captured reference PNG,
// a diff image of where, and the one-line verdict the `reference: <case>` row
// carries. A pixel differs when any RGBA channel moves by more than
// CHANNEL_THRESHOLD.
//
// REQ-051 set the numbers from measurement (isolate-format.md → "_reference
// noise floor"): five independent `isolate test` renders of the same card were
// byte-identical (noise 0.000), so the threshold only absorbs rounding (±4); the
// old 24/255 hid a one-palette-step token swap (blue-600 → blue-700 moves a
// channel by 21) and a muted-text step (Δ20) entirely — both measured 0.000.
import { decodePng, encodePng, type Image } from "./png.ts";

export const CHANNEL_THRESHOLD = 4;

export interface Comparison {
  differing: number;
  total: number;
  fraction: number;
  sizeMismatch: boolean;
  /** The compared canvas (the larger of the two in each dimension). */
  width: number;
  height: number;
  /** The two inputs' own sizes (they differ when sizeMismatch). */
  refSize: { width: number; height: number };
  actualSize: { width: number; height: number };
}

/** Compare two RGBA images. Pixels outside the overlap count as differing. */
export function compareImages(
  ref: Image,
  actual: Image,
): Comparison & { diff: Image } {
  const width = Math.max(ref.width, actual.width);
  const height = Math.max(ref.height, actual.height);
  const diff = new Uint8Array(width * height * 4);
  let differing = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      const inA = x < ref.width && y < ref.height;
      const inB = x < actual.width && y < actual.height;
      let same = inA && inB;
      if (same) {
        const a = (y * ref.width + x) * 4, b = (y * actual.width + x) * 4;
        for (let c = 0; c < 4 && same; c++) {
          if (
            Math.abs(ref.data[a + c] - actual.data[b + c]) > CHANNEL_THRESHOLD
          ) {
            same = false;
          }
        }
        if (same) {
          // unchanged: a faded grey of the reference, so the red marks read in context
          const g = (ref.data[a] + ref.data[a + 1] + ref.data[a + 2]) / 3;
          diff.set([g, g, g, 64], d);
          continue;
        }
      }
      differing++;
      diff.set([255, 0, 0, 255], d);
    }
  }
  const total = width * height;
  return {
    differing,
    total,
    fraction: total ? differing / total : 0,
    sizeMismatch: ref.width !== actual.width || ref.height !== actual.height,
    width,
    height,
    refSize: { width: ref.width, height: ref.height },
    actualSize: { width: actual.width, height: actual.height },
    diff: { width, height, data: diff },
  };
}

export interface Verdict {
  ok: boolean;
  message: string;
}

/** REQ-059: beyond this many px of width or height difference the two images
 *  are not the same crop (another breakpoint, slot or device scale), and a
 *  fraction over their union would only measure that — the row fails as a size
 *  mismatch instead. Within it (a 1px padding or border drift moves a box by
 *  2px) the non-overlap counts as differing and the fraction is the verdict. */
export const SIZE_SLACK = 4;

/** The row text: what was compared, measured vs tolerance, where the diff went. */
export function referenceVerdict(
  c: Comparison,
  tolerance: number,
  diffPath: string,
  refPath: string,
): Verdict {
  const r = c.refSize, a = c.actualSize;
  const tail = `reference ${refPath}; diff ${diffPath}`;
  if (
    Math.abs(r.width - a.width) > SIZE_SLACK ||
    Math.abs(r.height - a.height) > SIZE_SLACK
  ) {
    return {
      ok: false,
      message:
        `size mismatch: reference ${r.width}×${r.height} vs render ${a.width}×${a.height} ` +
        `(more than ${SIZE_SLACK}px apart — not the same crop, so no fraction is judged; ` +
        `${c.fraction.toFixed(3)} over the union)${scaleHint(c)}; ${tail}`,
    };
  }
  const ok = c.fraction <= tolerance;
  const size = c.sizeMismatch
    ? ` (sizes differ — reference ${r.width}×${r.height} vs render ${a.width}×${a.height}, non-overlap counts)`
    : "";
  return {
    ok,
    message:
      `measured ${c.fraction.toFixed(3)} ${ok ? "≤" : ">"} tolerance ${
        tolerance.toFixed(3)
      } — ${c.differing}/${c.total} px differ (a channel moved more than ${CHANNEL_THRESHOLD}/255) at ${c.width}×${c.height}${size}; ` +
      tail,
  };
}

/** An integer ratio between the sizes is a device-scale still: the runner
 *  renders at deviceScaleFactor 1 (a DPR-2 still measured 0.815 against it). */
function scaleHint(c: Comparison): string {
  const r = c.refSize, a = c.actualSize;
  const k = r.width / a.width;
  return Number.isInteger(k) && k > 1 && r.height === a.height * k
    ? ` — the reference is ${k}× the render, a deviceScaleFactor ${k} still: recapture it at deviceScaleFactor 1`
    : "";
}

export interface ReferenceResult extends Verdict {
  measured: number;
  diff: string;
}

/** Decode both PNGs, compare, write the diff PNG, return the verdict. */
export async function compareReferenceFiles(
  refPath: string,
  actualPath: string,
  diffPath: string,
  tolerance: number,
): Promise<ReferenceResult> {
  const ref = await decodePng(await Deno.readFile(refPath)).catch((e) => {
    throw new Error(`reference ${refPath}: ${(e as Error).message}`);
  });
  const actual = await decodePng(await Deno.readFile(actualPath));
  const c = compareImages(ref, actual);
  await Deno.writeFile(diffPath, await encodePng(c.diff));
  return {
    ...referenceVerdict(c, tolerance, diffPath, refPath),
    measured: c.fraction,
    diff: diffPath,
  };
}
