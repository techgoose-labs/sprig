// REQ-056 (unit) — `sprig isolate <subcommand>`: the argument plan the `isolate`
// case dispatches on. `test`/`list` go to the workbench runner with the app
// resolved like `sprig check` (--root, default "."); anything else is the dev
// workbench on an existing dir; an arg that is neither is an error naming it —
// never a silent "nothing to isolate".
import { assertEquals, assertStringIncludes } from "@std/assert";
import { commandHelp, parseIsolateArgs, USAGE } from "./.sprig/usage.ts";

const dirs = new Set([".", "app", "./test", "fixtures/x"]);
const isDir = (p: string) => dirs.has(p);

Deno.test("REQ-056: `isolate test --json` is the runner's test, app defaults to .", () => {
  assertEquals(parseIsolateArgs(["test", "--json"], isDir), {
    kind: "runner",
    sub: "test",
    app: ".",
    args: ["--json"],
  });
});

Deno.test("REQ-056: `isolate test` keeps filter, --evidence, --port; --root becomes the app", () => {
  assertEquals(
    parseIsolateArgs(
      [
        "test",
        "swatch",
        "--root",
        "app",
        "--evidence",
        "/tmp/e",
        "--port",
        "4301",
        "--json",
      ],
      isDir,
    ),
    {
      kind: "runner",
      sub: "test",
      app: "app",
      evidence: "/tmp/e",
      args: ["swatch", "--port", "4301", "--json"],
    },
  );
  assertEquals(
    parseIsolateArgs(["test", "--root=app"], isDir),
    { kind: "runner", sub: "test", app: "app", args: [] },
  );
});

Deno.test("REQ-056: `isolate list --root <app>` is the runner's list", () => {
  assertEquals(parseIsolateArgs(["list", "--root", "app"], isDir), {
    kind: "runner",
    sub: "list",
    app: "app",
    args: [],
  });
});

Deno.test("REQ-056: a --root that is not a directory is an error naming it", () => {
  const r = parseIsolateArgs(["test", "--root", "nope"], isDir);
  assertEquals(r.kind, "error");
  if (r.kind === "error") {
    assertStringIncludes(r.message, "'nope' is not a directory");
  }
});

Deno.test("REQ-056: no arg / an existing dir is today's dev workbench", () => {
  assertEquals(parseIsolateArgs([], isDir), {
    kind: "dev",
    app: ".",
    open: true,
  });
  assertEquals(parseIsolateArgs(["app", "--no-open"], isDir), {
    kind: "dev",
    app: "app",
    open: false,
  });
  // a dir literally named like a subcommand is reachable by its path
  assertEquals(parseIsolateArgs(["./test"], isDir), {
    kind: "dev",
    app: "./test",
    open: true,
  });
});

Deno.test("REQ-056: an arg that is neither a subcommand nor a dir is an error, exit-worthy", () => {
  assertEquals(parseIsolateArgs(["tset", "--json"], isDir), {
    kind: "error",
    message:
      "sprig isolate: 'tset' is not a subcommand (test|list) and not a directory",
  });
});

Deno.test("REQ-056: `sprig isolate --help` documents test and list", () => {
  const h = commandHelp("isolate");
  assertStringIncludes(h, "sprig isolate test");
  assertStringIncludes(h, "sprig isolate list");
  assertStringIncludes(h, "nothing was checked");
  assertStringIncludes(USAGE, "sprig isolate [appDir]");
});
