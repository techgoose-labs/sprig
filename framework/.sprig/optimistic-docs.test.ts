// REQ-031 — the docs teach the optimistic write, not the awaited one.
import { assert, assertMatch } from "@std/assert";
import { lintOptimisticSource } from "./compiler/lints/optimistic-writes.ts";

const read = (rel: string) =>
  Deno.readTextFile(new URL(`../../${rel}`, import.meta.url));

const ISLANDS = "docs/sprig/islands.md";
const MODEL = "claude/skills/sprig:build/references/component-model.md";

/** The ```ts blocks of a markdown doc. */
const tsBlocks = (md: string) =>
  [...md.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);

for (const doc of [ISLANDS, MODEL]) {
  Deno.test(`REQ-031: ${doc} shows optimistic( from @techgoose-labs/sprig`, async () => {
    const md = await read(doc);
    assertMatch(md, /optimistic\(/);
    assertMatch(
      md,
      /import \{[^}]*\boptimistic\b[^}]*\} from "@techgoose-labs\/sprig"/,
    );
  });

  Deno.test(`REQ-031: ${doc} has no code example that awaits the server before the UI moves`, async () => {
    const md = await read(doc);
    assert(
      !/const res = await fetch\("\/api\/http\/post-test-run"/.test(md),
      "the await-first island example is gone",
    );
    for (const [n, block] of tsBlocks(md).entries()) {
      const r = lintOptimisticSource(block, `${doc}#ts-block-${n + 1}`);
      assert(
        r.findings.length === 0,
        `optimistic-writes flags a doc example: ${JSON.stringify(r.findings)}`,
      );
    }
  });
}

Deno.test("REQ-031: component-model.md routes the genuine wait to // sprig-wait: <reason>, not data-note", async () => {
  const md = await read(MODEL);
  assertMatch(md, /\/\/ sprig-wait: <reason>/);
  const section = md.slice(
    md.indexOf("## Optimistic UI"),
    md.indexOf("## The serialization boundary"),
  );
  assert(!/data-note/.test(section), "the escape is the sprig-wait comment");
});
