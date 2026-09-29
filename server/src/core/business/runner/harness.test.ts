// REQ-059 — the harness side of a `_reference` capture: the render is pinned to
// device scale 1, the still's path rides in the wrapper so the unit is laid out
// in a slot the still's width, and the app's own font sources are loaded.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import {
  appFontSources,
  HARNESS_SOURCE,
  type PlannedCase,
  wrapperSource,
} from "./harness.ts";

const REF: PlannedCase = {
  key: "message-card/with-photo",
  unit: "message-card",
  caseName: "with-photo",
  route: "/components/guestbook/message-card/with-photo",
  viewport: { width: 1280, height: 720 },
  reference: {
    image: "/git/spec/ui/breakdown/mc/screenshots/with-photo@1280.png",
    tolerance: 0.01,
  },
  files: [],
};

Deno.test("REQ-059: a _reference case's wrapper carries the still path and the harness pins device scale 1", () => {
  const src = wrapperSource(
    REF,
    "/ev/specs/isolate-harness.ts",
    "/ev/cases/mc",
  );
  const json = JSON.parse(src.match(/const CASE = (.*);\n/)![1]);
  assertEquals(json.reference, { image: REF.reference!.image });
  assertStringIncludes(
    HARNESS_SOURCE,
    "if (c.reference) test.use({ deviceScaleFactor: 1 });",
  );
  // no reference → no pin, no still in the payload
  const plain = wrapperSource(
    { ...REF, reference: undefined },
    "/h.ts",
    "/ev/x",
  );
  assert(!JSON.parse(plain.match(/const CASE = (.*);\n/)![1]).reference);
});

Deno.test("REQ-059: the capture lays the unit out in a slot the still's pixel width, at the case's viewport", () => {
  for (
    const s of [
      "stillSize(c.reference.image)",
      '"px !important;',
      "place-items: start stretch !important; padding: 0 !important;",
      "await loadAppFonts(page);",
    ]
  ) assertStringIncludes(HARNESS_SOURCE, s);
});

Deno.test("REQ-059: appFontSources — the shell head's stylesheet links and style blocks, the global stylesheets' @import/@font-face", () => {
  const g =
    "https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Quicksand:wght@300;400;500;600;700&display=swap";
  const src = appFontSources({
    "bootstrap/template.html": `<!DOCTYPE html><html><head>
      <link rel="preconnect" href="https://fonts.gstatic.com">
      <link rel="stylesheet" href="${g}">
      <link href="/_assets/fonts.css" rel="stylesheet">
      <style>body { font-synthesis: none }</style>
    </head><body><router-outlet></router-outlet></body></html>`,
    "bootstrap/styles.css": `@import "tailwindcss";
      @import url('${g}');
      @font-face { font-family: "Brand"; src: url(https://cdn.example/brand.woff2); }`,
    "src/shell/styles.css": `@import url("https://cdn.example/other.css");`,
  });
  // the semicolons in a Google Fonts URL survive; duplicates collapse
  assertEquals(src.urls, [g, "https://cdn.example/other.css"]);
  assertEquals(src.skipped, ["/_assets/fonts.css"]); // named on the row, not silently dropped
  assertEquals(src.css.length, 2);
  assertStringIncludes(src.css[1], 'font-family: "Brand"');
});

Deno.test("REQ-059: appFontSources — bootstrap/head.html is the head beside a body-only shell, as in the framework; no font declared → none loaded", () => {
  const link = `<link rel=stylesheet href="https://f.example/a.css">`;
  assertEquals(
    appFontSources({
      "bootstrap/template.html":
        `<div class="app-root"><router-outlet></router-outlet></div>`,
      "bootstrap/head.html": link,
    }).urls,
    ["https://f.example/a.css"],
  );
  // without bootstrap/template.html the framework never reads head.html
  assertEquals(appFontSources({ "bootstrap/head.html": link }).urls, []);
  assertEquals(appFontSources({}), { urls: [], css: [], skipped: [] });
});
