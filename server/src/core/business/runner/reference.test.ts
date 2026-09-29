// REQ-042 — the reference compare, without a browser: a PNG codec of our own and
// the fraction-of-differing-pixels measure the `reference: <case>` row reports.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { decodePng, encodePng } from "./png.ts";
import {
  CHANNEL_THRESHOLD,
  compareImages,
  referenceVerdict,
  SIZE_SLACK,
} from "./reference.ts";

function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(rgba, i * 4);
  return { width: w, height: h, data: px };
}

Deno.test("REQ-042: encodePng → decodePng round-trips RGBA pixels exactly", async () => {
  const img = solid(7, 5, [10, 20, 30, 255]);
  img.data.set([200, 100, 50, 128], (2 * 7 + 3) * 4);
  const back = await decodePng(await encodePng(img));
  assertEquals(back.width, 7);
  assertEquals(back.height, 5);
  assertEquals(back.data, img.data);
});

Deno.test("REQ-042: decodePng rejects a non-PNG with a message saying so", async () => {
  let msg = "";
  try {
    await decodePng(new TextEncoder().encode("not a png"));
  } catch (e) {
    msg = (e as Error).message;
  }
  assertStringIncludes(msg, "not a PNG");
});

Deno.test("REQ-042: compareImages — identical images measure 0", () => {
  const r = compareImages(
    solid(4, 4, [1, 2, 3, 255]),
    solid(4, 4, [1, 2, 3, 255]),
  );
  assertEquals(r.differing, 0);
  assertEquals(r.fraction, 0);
});

Deno.test("REQ-042: compareImages — counts pixels past the channel threshold; sub-threshold noise is equal", () => {
  const a = solid(10, 10, [100, 100, 100, 255]);
  const b = solid(10, 10, [100, 100, 100, 255]);
  b.data.set([100 + CHANNEL_THRESHOLD, 100, 100, 255], 0); // at threshold: equal
  for (let i = 1; i <= 3; i++) b.data.set([255, 0, 0, 255], i * 4); // 3 differ
  const r = compareImages(a, b);
  assertEquals(r.differing, 3);
  assertEquals(r.total, 100);
  assertEquals(r.fraction, 0.03);
  // the diff image marks exactly the differing pixels in red
  assertEquals([...r.diff.data.slice(4, 8)], [255, 0, 0, 255]);
  assert(r.diff.data[3] < 255); // unchanged pixels are faded, not red
});

Deno.test("REQ-042: compareImages — a size mismatch counts the non-overlap as differing", () => {
  const r = compareImages(
    solid(10, 10, [0, 0, 0, 255]),
    solid(10, 5, [0, 0, 0, 255]),
  );
  assertEquals(r.total, 100);
  assertEquals(r.differing, 50);
  assertEquals(r.sizeMismatch, true);
});

Deno.test("REQ-042: referenceVerdict — the row text names measured vs tolerance and the evidence", () => {
  const fail = referenceVerdict(
    {
      differing: 34,
      total: 1000,
      fraction: 0.034,
      sizeMismatch: false,
      width: 40,
      height: 25,
      refSize: { width: 40, height: 25 },
      actualSize: { width: 40, height: 25 },
    },
    0.01,
    "/ev/diff.png",
    "/p/ref.png",
  );
  assertEquals(fail.ok, false);
  assertStringIncludes(fail.message, "measured 0.034 > tolerance 0.010");
  assertStringIncludes(fail.message, "/ev/diff.png");
  const pass = referenceVerdict(
    {
      differing: 0,
      total: 1000,
      fraction: 0,
      sizeMismatch: false,
      width: 40,
      height: 25,
      refSize: { width: 40, height: 25 },
      actualSize: { width: 40, height: 25 },
    },
    0.01,
    "/ev/diff.png",
    "/p/ref.png",
  );
  assertEquals(pass.ok, true);
  assertStringIncludes(pass.message, "measured 0.000 ≤ tolerance 0.010");
});

// ---------------------------------------------------------------- REQ-051
// The metric's numbers, measured on real `isolate test` captures (see
// isolate-format.md → "_reference noise floor"): re-renders are byte-identical,
// so the per-channel threshold only has to absorb rounding; a one-palette-step
// colour change moves a channel by 6–21 and must count.

Deno.test("REQ-051: identical synthetic images measure exactly 0", () => {
  const a = solid(32, 16, [37, 99, 235, 255]);
  const r = compareImages(a, solid(32, 16, [37, 99, 235, 255]));
  assertEquals([r.differing, r.fraction], [0, 0]);
});

Deno.test("REQ-051: one differing pixel measures exactly 1/(w*h)", () => {
  const a = solid(40, 25, [255, 255, 255, 255]);
  const b = solid(40, 25, [255, 255, 255, 255]);
  b.data.set([0, 0, 0, 255], (7 * 40 + 11) * 4);
  const r = compareImages(a, b);
  assertEquals(r.differing, 1);
  assertEquals(r.fraction, 1 / (40 * 25));
});

Deno.test("REQ-051: the per-channel threshold is 4/255 — Δ4 is equal, Δ5 counts", () => {
  assertEquals(CHANNEL_THRESHOLD, 4);
  const a = solid(10, 10, [100, 100, 100, 255]);
  const b = solid(10, 10, [100, 100, 100, 255]);
  b.data.set([104, 96, 100, 255], 0); // rounding-sized: equal
  b.data.set([100, 100, 105, 255], 4); // one step past: differs
  assertEquals(compareImages(a, b).differing, 1);
});

Deno.test("REQ-051: a one-palette-step token swap counts (Δ≤21 per channel — the old 24/255 threshold measured it 0)", () => {
  // blue-600 → blue-700 (the measured primary swap, max Δ21) and
  // gray-50 → gray-100 (the smallest step of a common palette, max Δ6)
  for (
    const [from, to] of [
      [[37, 99, 235], [29, 78, 216]],
      [[249, 250, 251], [243, 244, 246]],
    ] as const
  ) {
    const r = compareImages(
      solid(20, 10, [...from, 255]),
      solid(20, 10, [...to, 255]),
    );
    assertEquals(r.fraction, 1, `${from} → ${to}`);
  }
});

Deno.test("REQ-051: an anti-aliased edge that re-renders within ±4 per channel stays equal", () => {
  // a 1px-wide grey ramp (an AA edge) whose coverage rounds differently
  const a = solid(8, 8, [255, 255, 255, 255]);
  const b = solid(8, 8, [255, 255, 255, 255]);
  for (let y = 0; y < 8; y++) {
    a.data.set([128, 128, 128, 255], (y * 8 + 3) * 4);
    b.data.set([131, 131, 131, 255], (y * 8 + 3) * 4);
  }
  assertEquals(compareImages(a, b).differing, 0);
});

Deno.test("REQ-051: content shifted by 1px measures far above the default tolerance", () => {
  // a 2px-wide dark bar on white, shifted right by one pixel
  const bar = (x0: number) => {
    const img = solid(50, 20, [255, 255, 255, 255]);
    for (let y = 0; y < 20; y++) {
      for (const x of [x0, x0 + 1]) {
        img.data.set([16, 24, 40, 255], (y * 50 + x) * 4);
      }
    }
    return img;
  };
  const r = compareImages(bar(10), bar(11));
  assertEquals(r.differing, 40); // the leading and trailing column
  assert(r.fraction > 0.01, `measured ${r.fraction}`);
});

Deno.test("REQ-051: the row says what was measured — the channel threshold and the compared size", () => {
  const same = compareImages(
    solid(4, 4, [0, 0, 0, 255]),
    solid(4, 4, [0, 0, 0, 255]),
  );
  const ok = referenceVerdict(same, 0.01, "/ev/d.png", "/p/r.png");
  assertStringIncludes(
    ok.message,
    "measured 0.000 ≤ tolerance 0.010 — 0/16 px differ (a channel moved more than 4/255) at 4×4",
  );
});

// ---------------------------------------------------------------- REQ-059
const white = (w: number, h: number) => solid(w, h, [255, 255, 255, 255]);

Deno.test("REQ-059: a size difference within 4px is a drift — the fraction is judged and both sizes named", () => {
  assertEquals(SIZE_SLACK, 4);
  // a 1px border/padding drift moves the box by 1–2px: the non-overlap counts
  const one = referenceVerdict(
    compareImages(white(320, 150), white(320, 151)),
    0.01,
    "/ev/d.png",
    "/p/r.png",
  );
  assertEquals(one.ok, true); // 320 / 48320 = 0.007
  assertStringIncludes(one.message, "measured 0.007 ≤ tolerance 0.010");
  assertStringIncludes(one.message, "reference 320×150 vs render 320×151");
  const two = referenceVerdict(
    compareImages(white(320, 150), white(320, 154)),
    0.01,
    "/ev/d.png",
    "/p/r.png",
  );
  assertEquals(two.ok, false); // 1280 / 49280 = 0.026
  assertStringIncludes(two.message, "measured 0.026 > tolerance 0.010");
});

Deno.test("REQ-059: beyond 4px the row fails as a size mismatch, whatever the tolerance", () => {
  // the eval-app still was an in-page crop 600 wide; the stage rendered the unit 897 wide
  const v = referenceVerdict(
    compareImages(white(600, 115), white(897, 95)),
    1,
    "/ev/d.png",
    "/p/r.png",
  );
  assertEquals(v.ok, false);
  assert(
    v.message.startsWith("size mismatch: reference 600×115 vs render 897×95"),
    v.message,
  );
  assertStringIncludes(v.message, "more than 4px apart");
  assert(!v.message.includes("deviceScaleFactor"), v.message);
});

Deno.test("REQ-059: a 2× still is named as a device-scale capture to redo at deviceScaleFactor 1", () => {
  // the old eval-app stills: 1200×230 = 2 × the 600×115 DPR-1 crop
  const v = referenceVerdict(
    compareImages(white(1200, 230), white(600, 115)),
    0.01,
    "/ev/d.png",
    "/p/r.png",
  );
  assertEquals(v.ok, false);
  assertStringIncludes(
    v.message,
    "size mismatch: reference 1200×230 vs render 600×115",
  );
  assertStringIncludes(v.message, "the reference is 2× the render");
  assertStringIncludes(v.message, "recapture it at deviceScaleFactor 1");
});
