// The artifact format's spec-root vectors, run in sprig's CI against the ONE
// implementation sprig now imports (D-9).
//
// There used to be an independent sprig implementation here, and the point of
// this file was to catch it drifting from rune's. There is nothing to drift:
// both toolchains call the same function. What this file still earns is the
// other half of the guarantee — that the version sprig RESOLVES is a conforming
// one, so a bad bedrock upgrade fails in sprig's CI rather than in an app's
// monorepo, where the two halves would quietly resolve different `spec/` dirs.

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { specRootOf, vendoredVector } from "@techgoose-labs/bedrock/artifact";

interface TreeEntry {
  path: string;
  kind: "dir" | "git-dir" | "git-file" | "symlink";
  target?: string;
}
interface Vector {
  name: string;
  tree: TreeEntry[];
  start: string;
  expected: string;
}

const { vectors } = JSON.parse(
  await vendoredVector("spec-root-vectors.json"),
) as {
  vectors: Vector[];
};

for (const v of vectors) {
  Deno.test(`spec-root vectors: ${v.name}`, async () => {
    const tmp = await Deno.makeTempDir({ prefix: "specroot-vec-" });
    try {
      for (const e of v.tree) {
        const p = join(tmp, e.path);
        if (e.kind === "dir" || e.kind === "git-dir") {
          await Deno.mkdir(p, { recursive: true });
        } else if (e.kind === "git-file") {
          await Deno.writeTextFile(p, "gitdir: elsewhere\n");
        } else if (e.kind === "symlink") {
          await Deno.symlink(join(tmp, e.target!), p);
        }
      }
      // specRootOf returns the ROOT dir; the vectors' expected value is
      // `<root>/spec/` — normalize to the vector form before comparing.
      const got = specRootOf(join(tmp, v.start));
      const rel = got === tmp ? "" : got.slice(tmp.length + 1);
      assertEquals((rel ? rel + "/" : "") + "spec/", v.expected);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  });
}
