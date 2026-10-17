// REQ-051 — the PNG codec the reference metric reads through: synthetic images
// survive encode → decode bit-exactly (so the metric's 1/(w*h) is exact through
// files), and a real browser capture from the noise fixture decodes at the size
// it was taken.
import { assertEquals } from "#std/assert";
import { fromFileUrl } from "#std/path";
import { decodePng, encodePng } from "./png.ts";
import { compareImages, compareReferenceFiles } from "./reference.ts";

const RENDER = fromFileUrl(
  new URL(
    "../../../../../fixtures/isolate/reference-noise-app/renders/guest-card.png",
    import.meta.url,
  ),
);

function img(w: number, h: number, fill: (x: number, y: number) => number[]) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(fill(x, y), (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}

Deno.test("REQ-051: a synthetic gradient PNG round-trips bit-exactly (identical → 0 through files)", async () => {
  const a = img(64, 9, (x, y) => [x * 4, y * 28, 255 - x * 4, 255 - y]);
  const back = await decodePng(await encodePng(a));
  assertEquals(back.data, a.data);
  assertEquals(compareImages(a, back).fraction, 0);
});

Deno.test("REQ-051: one changed pixel in a PNG file measures exactly 1/(w*h) end to end", async () => {
  const dir = await Deno.makeTempDir({ prefix: "req051-png-" });
  try {
    const a = img(30, 20, () => [255, 255, 255, 255]);
    const b = img(
      30,
      20,
      (x, y) => x === 5 && y === 5 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    await Deno.writeFile(`${dir}/ref.png`, await encodePng(a));
    await Deno.writeFile(`${dir}/actual.png`, await encodePng(b));
    const r = await compareReferenceFiles(
      `${dir}/ref.png`,
      `${dir}/actual.png`,
      `${dir}/diff.png`,
      0.01,
    );
    assertEquals(r.measured, 1 / 600);
    assertEquals(r.ok, true);
    const diff = await decodePng(await Deno.readFile(`${dir}/diff.png`));
    assertEquals([
      ...diff.data.subarray((5 * 30 + 5) * 4, (5 * 30 + 5) * 4 + 4),
    ], [255, 0, 0, 255]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-051: a real isolate capture decodes at its CSS size (DPR 1) and is opaque", async () => {
  const r = await decodePng(await Deno.readFile(RENDER));
  assertEquals([r.width, r.height], [320, 150]);
  let translucent = 0;
  for (let i = 3; i < r.data.length; i += 4) {
    if (r.data[i] !== 255) translucent++;
  }
  assertEquals(translucent, 0);
});
