// REQ-002 — `--help` prints help, for every subcommand, with no side effects.
//
// The dispatch switches on Deno.args[0] alone, so `--help` was invisible to it:
// `sprig dev --help` STARTED a dev server in the cwd (registered the shared
// process, bound the stable port, built the app), and `build --help` built,
// and `check --help` typechecked. The gate lives in its own module so it is
// testable without importing cli.ts — which runs the CLI on import.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { commandHelp, USAGE, wantsHelp } from "./usage.ts";

Deno.test("REQ-002: --help and -h are recognised, anywhere in the args", () => {
  assert(wantsHelp(["--help"]));
  assert(wantsHelp(["-h"]));
  assert(wantsHelp(["app", "--help"]));
  assert(wantsHelp(["--annotate", "x.html", "-h"]));
  assertEquals(wantsHelp([]), false);
  assertEquals(wantsHelp(["app", "--open"]), false);
  // a FILE that merely looks like the flag is not the flag
  assertEquals(wantsHelp(["--annotate", "help.html"]), false);
});

Deno.test("REQ-002: each subcommand's help is that subcommand's usage block", () => {
  const dev = commandHelp("dev");
  assertStringIncludes(dev, "sprig dev");
  assertStringIncludes(dev, "--annotate"); // its own continuation lines come too
  assertEquals(
    dev.includes("sprig build"),
    false,
    "bled into the next command",
  );

  assertStringIncludes(commandHelp("build"), "--rune");
  assertStringIncludes(commandHelp("migrate"), "wire-paths");
  assertStringIncludes(commandHelp("isolate"), "workbench");
});

Deno.test("REQ-002: every command the CLI dispatches has a help block", () => {
  // the switch's own case list — a command that dispatches but has no usage
  // block would silently answer --help with the whole manual.
  for (
    const cmd of [
      "init",
      "dev",
      "build",
      "clean",
      "check",
      "map",
      "isolate",
      "serve",
      "stop",
      "migrate",
      "install",
      "update",
    ]
  ) {
    const help = commandHelp(cmd);
    assert(
      help !== USAGE,
      `no usage block for "${cmd}" — --help would print the whole manual`,
    );
    assertStringIncludes(help, `sprig ${cmd}`);
  }
});

Deno.test("REQ-002: an unknown command falls back to the full usage", () => {
  assertEquals(commandHelp("nope"), USAGE);
});
