// REQ-059 — the harness side of a `_reference` capture: the render is pinned to
// device scale 1, the still's path rides in the wrapper so the unit is laid out
// in a slot the still's width, and the app's own font sources are loaded.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import {
  appFontSources,
  appPageBackground,
  appPageText,
  HARNESS_SOURCE,
  type PlannedCase,
  stageBackgrounds,
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

// ---------------------------------------------------------------- REQ-063
Deno.test("REQ-063: appPageBackground — the body (else html) background the app shell declares, last stylesheet wins", () => {
  // the kennel app's shell: the mock paints the page on base-200
  assertEquals(
    appPageBackground({
      "bootstrap/styles.css":
        `@font-face { font-family: 'Caveat'; src: url(x) }`,
      "src/shell/styles.css": `:global(body) {
  margin: 0;
  background: var(--color-base-200, #f3eadb);
  color: var(--color-base-content, #3b2a1e);
}
:global(h1), :global(h2) { font-family: var(--font-display); }`,
    }),
    {
      value: "var(--color-base-200, #f3eadb)",
      source: "src/shell/styles.css body",
    },
  );
  // background-color counts, !important is dropped, a later file overrides
  assertEquals(
    appPageBackground({
      "bootstrap/template.html":
        `<html><head><style>html { background-color: #101010 }</style></head><body></body></html>`,
      "bootstrap/styles.css":
        `html, body { background-color: #fafafa !important; }`,
    }),
    { value: "#fafafa", source: "bootstrap/styles.css body" },
  );
  // html only (propagates to the canvas) when no body background is declared
  assertEquals(
    appPageBackground({
      "bootstrap/template.html":
        `<html><head><style>html { background: #101010 }</style></head><body></body></html>`,
    }),
    { value: "#101010", source: "bootstrap/template.html <head> html" },
  );
  // a body rule without a background, a descendant selector, nothing at all
  assertEquals(
    appPageBackground({
      "src/shell/styles.css":
        `body { margin: 0 } body .card { background: red } .body { background: blue }`,
    }),
    null,
  );
  assertEquals(appPageBackground({}), null);
});

Deno.test("REQ-063: stageBackgrounds — the case's explicit colour, else the fixture's, else the app page background, else --color-base-100, else the browser canvas", () => {
  const page = {
    value: "var(--color-base-200)",
    source: "src/shell/styles.css body",
  };
  assertEquals(stageBackgrounds(undefined, page), [
    {
      value: "var(--color-base-200)",
      source: "the app's page background (src/shell/styles.css body)",
      explicit: false,
    },
    {
      value: "var(--color-base-100)",
      source: "the design system's --color-base-100",
      explicit: false,
    },
    {
      value: "#ffffff",
      source:
        "the browser's default canvas (the app declares no page background)",
      explicit: false,
    },
  ]);
  const explicit = stageBackgrounds(
    { value: "#123456", from: "the case's _reference.background" },
    page,
  );
  assertEquals(explicit[0], {
    value: "#123456",
    source: "the case's _reference.background",
    explicit: true,
  });
  assertEquals(explicit.length, 1); // an explicit colour never falls back
  assertEquals(
    stageBackgrounds(undefined, null)[0].value,
    "var(--color-base-100)",
  );
});

Deno.test("REQ-063: the wrapper carries the explicit stage background and the motion trigger; the harness paints the stage and performs the trigger", () => {
  const src = wrapperSource(
    {
      ...REF,
      stageBackground: { value: "#fff", from: "the fixture's background" },
      motion: { spec: "/m.json", trigger: "hover" },
    },
    "/h.ts",
    "/ev/x",
  );
  const json = JSON.parse(src.match(/const CASE = (.*);\n/)![1]);
  assertEquals(json.stageBackground, {
    value: "#fff",
    from: "the fixture's background",
  });
  assertEquals(json.motion, { trigger: "hover" });
  for (
    const s of [
      "const appPageBackground = ",
      "const stageBackgrounds = ",
      "await paintStage(page, c);",
      "html, body, .iso-stage-page { background: ",
      '"stage background " + ',
      "await performTrigger(page, trigger);",
      'if (trigger === "hover") await root.hover();',
      '"motion trigger: " + ',
    ]
  ) assertStringIncludes(HARNESS_SOURCE, s);
});

Deno.test("REQ-068: appPageText — the shell body's color, font-family, font-size and line-height (else html's), last stylesheet wins, as written", () => {
  // the kennel app's shell body
  assertEquals(
    appPageText({
      "src/shell/styles.css": `:global(body) {
  margin: 0;
  font-family: var(--font-body, ui-sans-serif, system-ui, sans-serif);
  background: var(--color-base-200, #f3eadb);
  color: var(--color-base-content, #3b2a1e);
  font-size: var(--step-0, 1rem);
  line-height: var(--leading-normal, 1.5);
}
:global(h1) { font-family: var(--font-display); line-height: 1.1; }`,
    }),
    [
      {
        prop: "color",
        value: "var(--color-base-content, #3b2a1e)",
        source: "src/shell/styles.css body",
      },
      {
        prop: "font-family",
        value: "var(--font-body, ui-sans-serif, system-ui, sans-serif)",
        source: "src/shell/styles.css body",
      },
      {
        prop: "font-size",
        value: "var(--step-0, 1rem)",
        source: "src/shell/styles.css body",
      },
      {
        prop: "line-height",
        value: "var(--leading-normal, 1.5)",
        source: "src/shell/styles.css body",
      },
    ],
  );
  // body beats html per property; a later file overrides; !important dropped;
  // background-color is not text; nothing declared → nothing
  assertEquals(
    appPageText({
      "bootstrap/template.html":
        `<html><head><style>html { color: #111; font-size: 18px }</style></head><body></body></html>`,
      "bootstrap/styles.css": `body { color: #222 !important; }`,
      "src/shell/styles.css": `body { color: #333; background-color: #fff }`,
    }),
    [
      { prop: "color", value: "#333", source: "src/shell/styles.css body" },
      {
        prop: "font-size",
        value: "18px",
        source: "bootstrap/template.html <head> html",
      },
    ],
  );
  assertEquals(appPageText({}), []);
});

Deno.test("REQ-068: the harness stage inherits the shell body's text (color, font) under the case's theme and the row lists what it applied", () => {
  for (
    const s of [
      "const appPageText = ",
      "appPageText(readAppFiles())",
      '"stage text " + ',
      '"body, .iso-stage-page { " + ',
    ]
  ) assertStringIncludes(HARNESS_SOURCE, s);
});
