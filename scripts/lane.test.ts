// REQ-021 — a test's kind is its filename; a lane reaches only its own kind.
import { assertEquals } from "@std/assert";
import { kindOf, laneFiles } from "./lane.ts";

Deno.test("REQ-021: kindOf mirrors the gate's filename rule", () => {
  assertEquals(kindOf("framework/serve-marker.test.ts"), "unit");
  assertEquals(kindOf("framework/serve-marker.int.test.ts"), "int");
  assertEquals(kindOf("x/y.docker.test.ts"), "int");
  assertEquals(kindOf("framework/serve-marker.e2e.test.ts"), "e2e");
  assertEquals(kindOf("e2e/login/login.e2e.test.ts"), "e2e");
  assertEquals(kindOf("e2e/login/login.test.ts"), "e2e");
  assertEquals(kindOf("cli/lib/ping.smk.test.ts"), "smoke");
});

Deno.test("REQ-021: laneFiles keeps only test files of the lane's kind, never smoke", () => {
  const all = [
    "a/b.test.ts",
    "a/b.int.test.ts",
    "a/b.e2e.test.ts",
    "e2e/c/c.test.ts",
    "a/b.smk.test.ts",
    "a/mod.ts",
    "a/not_a_test.md",
    "a/b_test.ts",
  ];
  assertEquals(laneFiles("unit", all), ["a/b.test.ts", "a/b_test.ts"]);
  assertEquals(laneFiles("int", all), ["a/b.int.test.ts"]);
  assertEquals(laneFiles("e2e", all), ["a/b.e2e.test.ts", "e2e/c/c.test.ts"]);
});
