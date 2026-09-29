// REQ-025 — shadowing a shared selector needs an explicit opt-in.
import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, join } from "@std/path";
import { scanApp } from "./composition-scan.ts";
import { findShadows, shadowReason } from "./shadow.ts";

async function app(files: Record<string, string>): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "sprig-shadow-" });
  for (const [rel, text] of Object.entries(files)) {
    await Deno.mkdir(dirname(join(root, rel)), { recursive: true });
    await Deno.writeTextFile(join(root, rel), text);
  }
  return join(root, "src");
}

Deno.test("REQ-025: the opt-in marker is the template's leading comment", () => {
  assertEquals(
    shadowReason(`<!-- sprig-shadows: dense KPI tile -->\n<b></b>`),
    "dense KPI tile",
  );
  assertEquals(
    shadowReason(`\n  <!--sprig-shadows:  two\n  lines -->`),
    "two lines",
  );
  assertEquals(shadowReason(`<!-- sprig-shadows: -->`), "");
  assertEquals(shadowReason(`<b></b><!-- sprig-shadows: too late -->`), null);
  assertEquals(shadowReason(`<!-- a note -->`), null);
});

Deno.test("REQ-025: an undeclared shadow is refused naming both folders; an empty reason too", async () => {
  const src = await app({
    "src/shared/card/template.html": `<div></div>`,
    "src/shared/chip/template.html": `<i></i>`,
    "src/pages/home/template.html": `<card></card><chip></chip>`,
    "src/pages/home/components/card/template.html": `<section></section>`,
    "src/pages/home/components/chip/template.html":
      `<!-- sprig-shadows: -->\n<i></i>`,
  });
  try {
    const r = findShadows(await scanApp(src));
    assertEquals(r.notes, []);
    assertEquals(r.errors.length, 2);
    assertStringIncludes(
      r.errors[0],
      `src/pages/home/components/card/template.html:1 error: page-local <card> (src/pages/home/components/card) shadows the shared component <card> (src/shared/card) on page "home"`,
    );
    assertStringIncludes(
      r.errors[0],
      "<!-- sprig-shadows: <why this page needs its own card> -->",
    );
    assertStringIncludes(r.errors[1], "sprig-shadows marker gives no reason");
  } finally {
    await Deno.remove(dirname(src), { recursive: true });
  }
});

Deno.test("REQ-025: an opted-in shadow passes and prints '<page>/<selector> shadows shared <selector>: <reason>'", async () => {
  const src = await app({
    "src/shared/card/template.html": `<div></div>`,
    "src/pages/home/template.html": `<card></card>`,
    "src/pages/home/components/card/template.html":
      `<!-- sprig-shadows: the home card is a dense KPI tile -->\n<section></section>`,
  });
  try {
    const r = findShadows(await scanApp(src));
    assertEquals(r.errors, []);
    assertEquals(r.notes, [
      "home/card shadows shared card: the home card is a dense KPI tile",
    ]);
  } finally {
    await Deno.remove(dirname(src), { recursive: true });
  }
});

Deno.test("REQ-025: a page mounting its own same-named island is not a shadow", async () => {
  const src = await app({
    "src/pages/workbench/template.html": `<workbench></workbench>`,
    "src/pages/workbench/components/workbench/template.html": `<div></div>`,
  });
  try {
    const r = findShadows(await scanApp(src));
    assertEquals([r.errors, r.notes, r.shadows.length], [[], [], 0]);
  } finally {
    await Deno.remove(dirname(src), { recursive: true });
  }
});
