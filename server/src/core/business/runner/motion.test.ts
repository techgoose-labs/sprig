// REQ-045 — reading a captured motion spec (tolerant of the breakdown's raw
// getAnimations() records) and comparing it to what the build renders.
import { assertEquals, assertStringIncludes } from "#std/assert";
import { compareMotion, normalizeEasing, readMotionRecords } from "./motion.ts";

Deno.test("REQ-045: readMotionRecords — the flat schema, extra fields ignored", () => {
  const r = readMotionRecords([
    {
      selector: ".toast",
      name: "slide-in",
      duration: 250,
      easing: "ease-out",
      keyframeCount: 2,
      delay: 0,
      iterations: 1,
      playState: "running",
    },
  ]);
  assertEquals(r, [{
    selector: ".toast",
    name: "slide-in",
    duration: 250,
    easing: "ease-out",
    keyframeCount: 2,
    delay: 0,
    iterations: 1,
  }]);
});

Deno.test("REQ-045: readMotionRecords — the breakdown's raw capture form ({ target, keyframes, timing })", () => {
  const r = readMotionRecords({
    animations: [{
      kind: "CSSAnimation",
      name: "pulse",
      target: "span.dot",
      keyframes: [{ offset: 0, easing: "ease-in-out" }, {
        offset: 1,
        easing: "ease-in-out",
      }],
      timing: { duration: 1200, delay: 0, iterations: null, easing: "linear" },
    }],
  });
  // a CSS animation's easing lives on its keyframes; timing.easing is "linear"
  assertEquals(r, [{
    selector: "span.dot",
    name: "pulse",
    duration: 1200,
    easing: "ease-in-out",
    keyframeCount: 2,
    delay: 0,
    iterations: Infinity,
  }]);
});

Deno.test("REQ-045: normalizeEasing — whitespace and number spelling don't count as differences", () => {
  assertEquals(
    normalizeEasing("cubic-bezier(.4, 0, .2, 1)"),
    normalizeEasing("cubic-bezier(0.4,0,0.2,1)"),
  );
  assertEquals(normalizeEasing(" Ease-Out "), "ease-out");
});

Deno.test("REQ-045: compareMotion — equal specs pass and say what was compared", () => {
  const a = [{
    selector: ".t",
    name: "x",
    duration: 250,
    easing: "ease",
    keyframeCount: 2,
  }];
  const r = compareMotion(a, a);
  assertEquals(r.ok, true);
  assertEquals(r.differences, []);
  assertStringIncludes(
    r.summary,
    "compared 1 spec animation(s) with 1 rendered",
  );
});

Deno.test("REQ-045: compareMotion — names each duration, easing and keyframe-count difference", () => {
  const spec = [
    {
      selector: ".t",
      name: "slide",
      duration: 250,
      easing: "ease-out",
      keyframeCount: 2,
    },
    {
      selector: ".dot",
      name: "pulse",
      duration: 1200,
      easing: "linear",
      keyframeCount: 3,
    },
  ];
  const actual = [
    {
      selector: ".t",
      name: "slide",
      duration: 300,
      easing: "ease-in",
      keyframeCount: 2,
    },
  ];
  const r = compareMotion(spec, actual);
  assertEquals(r.ok, false);
  const all = r.differences.join("\n");
  assertStringIncludes(all, "duration 300ms ≠ spec 250ms");
  assertStringIncludes(all, 'easing "ease-in" ≠ spec "ease-out"');
  assertStringIncludes(all, "pulse");
  assertStringIncludes(all, "missing");
});

Deno.test("REQ-045: compareMotion — an animation the spec doesn't have is a difference", () => {
  const r = compareMotion([], [{
    selector: ".x",
    name: "spin",
    duration: 100,
    easing: "linear",
    keyframeCount: 2,
  }]);
  assertEquals(r.ok, false);
  assertStringIncludes(r.differences[0], "unexpected");
  assertStringIncludes(r.differences[0], "spin");
});
