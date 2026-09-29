// REQ-042 — the reference compare, without a browser: a PNG codec of our own and
// the fraction-of-differing-pixels measure the `reference: <case>` row reports.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { decodePng, encodePng } from "./png.ts";
import {
  CHANNEL_THRESHOLD,
  compareImages,
  referenceVerdict,
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
    },
    0.01,
    "/ev/diff.png",
    "/p/ref.png",
  );
  assertEquals(pass.ok, true);
  assertStringIncludes(pass.message, "measured 0.000 ≤ tolerance 0.010");
});
