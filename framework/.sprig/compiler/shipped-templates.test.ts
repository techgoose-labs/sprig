// REQ-001 — a malformed template must never ship.
//
// The isolate workbench builds the app it materializes from THIS repo, so a
// template.html here that doesn't parse takes `sprig dev` down at boot on every
// box, for every app — which is exactly what happened: commit 4390b3d flipped
// `{{ status() === 'running' … }}` to double quotes in two of them and the
// workbench started dying after "Generated N preview page(s)".
//
// So the rule is enforced, not remembered: every template.html the repo ships
// goes through the same parseTemplate the build calls.
import { assertEquals } from "@std/assert";
import { walk } from "@std/fs";
import { relative } from "@std/path";
import { parseTemplate } from "./parse.ts";

const REPO = new URL("../../../", import.meta.url).pathname;

Deno.test("REQ-001: every template.html in the repo parses cleanly", async () => {
  const failures: string[] = [];
  let seen = 0;
  for await (
    const e of walk(REPO, {
      exts: [".html"],
      includeDirs: false,
      skip: [
        /node_modules/,
        /\/static\//,
        /\/\.git\//,
        /\/scratchpad\//,
        /\/test-results\//,
      ],
    })
  ) {
    if (!e.name.endsWith("template.html")) continue;
    seen++;
    try {
      await parseTemplate(await Deno.readTextFile(e.path));
    } catch (err) {
      failures.push(
        `${relative(REPO, e.path)}\n    ${
          (err as Error).message.split("\n").slice(0, 2).join("\n    ")
        }`,
      );
    }
  }
  // A sweep that silently finds nothing is a green test that proves nothing.
  assertEquals(seen > 20, true, `only ${seen} templates found — walk is wrong`);
  assertEquals(
    failures.length,
    0,
    `${failures.length} shipped template(s) do not parse:\n  ${
      failures.join("\n  ")
    }`,
  );
});
