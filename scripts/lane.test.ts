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

// REQ-021 AMENDMENT — the lanes run `deno test --parallel`, whose test modules
// share ONE process: a test that calls Deno.chdir moves every concurrent test's
// cwd under it (measured: render-version-race chdir'd to a temp dir and the
// workbench SSR test, hashing <cwd>/static, went red at random). No lane test
// may change the process cwd or env; a renderer takes its assets dir and env
// reader as options, the runner takes its env as an option.
Deno.test("REQ-021 AMENDMENT: no test file in any lane calls Deno.chdir or mutates Deno.env", async () => {
  const out = await new Deno.Command("git", {
    args: ["ls-files", "--cached", "--others", "--exclude-standard"],
    stdout: "piped",
  }).output();
  const files = new TextDecoder().decode(out.stdout).split("\n").filter((f) =>
    /(^|\/)([^/]*[_.])?test\.(ts|tsx|mts|js|mjs|jsx)$/.test(f) && !f.includes("node_modules/")
  );
  const offenders: string[] = [];
  for (const f of files) {
    const src = await Deno.readTextFile(f);
    if (/Deno\.(chdir|env\.set|env\.delete)\(/.test(src)) offenders.push(f);
  }
  assertEquals(offenders, [], "these tests mutate the shared process (cwd or env): " + offenders.join(", "));
});
