// The reference compare behind a case's `_reference` (REQ-042): the fraction of
// pixels that differ between the rendered case and the captured reference PNG,
// a diff image of where, and the one-line verdict the `reference: <case>` row
// carries. A pixel differs when any RGBA channel moves by more than
// CHANNEL_THRESHOLD (anti-aliasing and colour-rounding noise stay equal).
import { decodePng, encodePng, type Image } from "./png.ts";

export const CHANNEL_THRESHOLD = 24;

export interface Comparison {
  differing: number;
  total: number;
  fraction: number;
  sizeMismatch: boolean;
  /** The compared canvas (the larger of the two in each dimension). */
  width: number;
  height: number;
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
    diff: { width, height, data: diff },
  };
}

export interface Verdict {
  ok: boolean;
  message: string;
}

/** The row text: what was compared, measured vs tolerance, where the diff went. */
export function referenceVerdict(
  c: Comparison,
  tolerance: number,
  diffPath: string,
  refPath: string,
): Verdict {
  const ok = c.fraction <= tolerance;
  const size = c.sizeMismatch ? " (sizes differ — non-overlap counts)" : "";
  return {
    ok,
    message:
      `measured ${c.fraction.toFixed(3)} ${ok ? "≤" : ">"} tolerance ${
        tolerance.toFixed(3)
      } — ${c.differing}/${c.total} px differ at ${c.width}×${c.height}${size}; ` +
      `reference ${refPath}; diff ${diffPath}`,
  };
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
