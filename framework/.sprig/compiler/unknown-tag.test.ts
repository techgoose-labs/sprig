// REQ-024 — an unknown tag is a compile error, not a silent native element.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { dirname, join } from "@std/path";
import { scanApp } from "./composition-scan.ts";
import {
  didYouMean,
  findUnknownTags,
  isKnownElement,
  levenshtein,
  readCustomElements,
  unknownTagMessage,
} from "./unknown-tag.ts";

/** Write `files` (path under the app dir → content) into a fresh temp app; return its src/. */
async function app(files: Record<string, string>): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "sprig-unknown-tag-" });
  for (const [rel, text] of Object.entries(files)) {
    await Deno.mkdir(dirname(join(root, rel)), { recursive: true });
    await Deno.writeTextFile(join(root, rel), text);
  }
  return join(root, "src");
}
const cleanup = (src: string) => Deno.remove(dirname(src), { recursive: true });

Deno.test("REQ-024: did-you-mean picks the nearest selector within edit distance 2", () => {
  assertEquals(levenshtein("stat-crd", "stat-card"), 1);
  assertEquals(levenshtein("", "abc"), 3);
  assertEquals(didYouMean("stat-crd", ["sparkline", "stat-card"]), "stat-card");
  assertEquals(didYouMean("sparklin", ["sparkline", "stat-card"]), "sparkline");
  assertEquals(
    didYouMean("totally-else", ["sparkline", "stat-card"]),
    undefined,
  );
});

Deno.test("REQ-024: HTML, SVG (camelCase) and MathML names are known elements; a typo is not", () => {
  for (
    const t of [
      "div",
      "button",
      "linearGradient",
      "feGaussianBlur",
      "stop",
      "math",
      "mrow",
    ]
  ) {
    assert(isKnownElement(t), t);
  }
  for (const t of ["stat-card", "sparkline", "buton"]) {
    assert(!isKnownElement(t), t);
  }
});

Deno.test("REQ-024: a typo'd tag fails naming file:line, tag and the nearest selector; real markup passes", async () => {
  const src = await app({
    "src/shared/sparkline/template.html":
      `<svg><linearGradient id="g"><stop offset="0" /></linearGradient></svg>`,
    "src/pages/home/template.html":
      `<main>\n  <router-outlet></router-outlet>\n  <sparkline></sparkline>\n  <sparklin></sparklin>\n  <ng-container><content></content></ng-container>\n</main>`,
  });
  try {
    const r = findUnknownTags(await scanApp(src));
    assertEquals(r.unknown.map((u) => [u.file, u.line, u.tag, u.suggestion]), [
      ["src/pages/home/template.html", 4, "sparklin", "sparkline"],
    ]);
    const msg = unknownTagMessage(r.unknown[0]);
    assertStringIncludes(
      msg,
      "src/pages/home/template.html:4 error: unknown tag <sparklin>",
    );
    assertStringIncludes(msg, "did you mean <sparkline>?");
    assertStringIncludes(msg, `src/custom-elements.json: ["sparklin"]`);
    assert(r.checked >= 8, `checked ${r.checked}`);
  } finally {
    await cleanup(src);
  }
});

Deno.test("REQ-024: a page-local selector resolves on its own page only", async () => {
  const src = await app({
    "src/pages/home/template.html": `<kpi></kpi>`,
    "src/pages/home/components/kpi/template.html": `<b>1</b>`,
    "src/pages/about/template.html": `<kpi></kpi>`,
  });
  try {
    const r = findUnknownTags(await scanApp(src));
    assertEquals(r.unknown.map((u) => `${u.file}:${u.line} <${u.tag}>`), [
      "src/pages/about/template.html:1 <kpi>",
    ]);
    assertStringIncludes(
      unknownTagMessage(r.unknown[0]),
      `page "about" + the shared scope`,
    );
  } finally {
    await cleanup(src);
  }
});

Deno.test("REQ-024: src/custom-elements.json allows a third-party tag, and reports the ones it uses and the stale ones", async () => {
  const src = await app({
    "src/pages/home/template.html":
      `<x-foo></x-foo><iconify-icon></iconify-icon>`,
    "src/custom-elements.json": `["x-foo", "x-stale"]`,
  });
  try {
    const allow = (await readCustomElements(src))!;
    assertEquals(allow, ["x-foo", "x-stale"]);
    const r = findUnknownTags(await scanApp(src), allow);
    assertEquals(r.unknown.map((u) => u.tag), ["iconify-icon"]);
    assertEquals(r.allowedUsed, ["x-foo"]);
    assertEquals(r.allowedUnused, ["x-stale"]);
  } finally {
    await cleanup(src);
  }
});

Deno.test("REQ-024: custom-elements.json — absent is null, malformed or a non-custom-element name throws naming the entry", async () => {
  const none = await app({ "src/pages/home/template.html": `<p></p>` });
  const bad = await app({ "src/custom-elements.json": `{"x-foo": true}` });
  const noHyphen = await app({ "src/custom-elements.json": `["sparkline"]` });
  try {
    assertEquals(await readCustomElements(none), null);
    await assertRejects(
      () => readCustomElements(bad),
      Error,
      "must be a JSON array",
    );
    await assertRejects(
      () => readCustomElements(noHyphen),
      Error,
      `entry 0 ("sparkline") is not a custom-element name`,
    );
  } finally {
    for (const s of [none, bad, noHyphen]) await cleanup(s);
  }
});

Deno.test("REQ-024 AMENDMENT: a shared component composing a page-local-only selector fails naming the component, the tag and the defining page", async () => {
  const src = await app({
    "src/shared/wrapper/template.html": `<div>\n  <kpi></kpi>\n</div>`,
    "src/pages/home/template.html": `<wrapper></wrapper>`,
    "src/pages/home/components/kpi/template.html": `<b>1</b>`,
    "src/pages/about/template.html": `<wrapper></wrapper>`,
  });
  try {
    const r = findUnknownTags(await scanApp(src));
    assertEquals(r.unknown.map((u) => `${u.file}:${u.line} <${u.tag}>`), [
      "src/shared/wrapper/template.html:2 <kpi>",
    ]);
    const msg = unknownTagMessage(r.unknown[0]);
    assertStringIncludes(
      msg,
      `src/shared/wrapper/template.html:2 error: shared component <wrapper> uses <kpi>, which only page "home" defines (src/pages/home/components/kpi)`,
    );
    assertStringIncludes(
      msg,
      "a shared component may only compose shared components; promote <kpi> to shared-components/ or make <wrapper> page-local",
    );
  } finally {
    await cleanup(src);
  }
});
