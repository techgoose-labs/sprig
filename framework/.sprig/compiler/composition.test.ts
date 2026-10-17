// REQ-026 — the composition graph, from the renderer's own registry resolution.
// (REQ-024/025 — assertComposition prints what it checked and fails naming offenders.)
import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { copy } from "@std/fs/copy";
import {
  assertComposition,
  compositionGraph,
  compositionGraphJson,
  renderCompositionMap,
} from "./composition.ts";
import { ScopedRegistry } from "./composition-registry.ts";

const FIXTURE = fromFileUrl(
  new URL("./fixtures/composition-app", import.meta.url),
);

Deno.test("REQ-026: a page's registry resolves page-local first, then shared; the page-less one is shared-only", () => {
  const r = new ScopedRegistry<string>();
  r.add("shared/card", "card", "shared-card");
  r.add("pages/home", "home", "home-page");
  r.add("pages/home/components/card", "card", "home-card");
  assertEquals(r.forPage("home").get("card"), "home-card");
  assertEquals(r.forPage("about").get("card"), "shared-card");
  assertEquals(r.forPage(null).get("card"), "shared-card");
  assertThrows(
    () => r.add("other/card", "card", "x"),
    Error,
    `duplicate component selector "card"`,
  );
  assertThrows(
    () => r.add("pages/home/components/x/card", "card", "x"),
    Error,
    `page "home"`,
  );
});

Deno.test("REQ-026: the graph lists what each page and component composes, and who composes each component", async () => {
  const g = await compositionGraph(FIXTURE);
  assertEquals(g.pages, {
    dashboard: {
      dir: "src/pages/dashboard",
      composes: [
        "confirm-dialog",
        "dashboard/card",
        "dashboard/stat-card",
        "sparkline",
      ],
    },
    settings: {
      dir: "src/pages/settings",
      composes: ["card", "confirm-dialog"],
    },
  });
  assertEquals(g.components["confirm-dialog"], {
    dir: "src/shared/confirm-dialog",
    scope: "shared",
    composes: ["card"],
    composedBy: ["dashboard", "settings"],
  });
  assertEquals(g.components["dashboard/card"], {
    dir: "src/pages/dashboard/components/card",
    scope: "page-local",
    page: "dashboard",
    composes: [],
    composedBy: ["dashboard"],
  });
  assertEquals(g.components["sparkline"].composedBy, [
    "dashboard",
    "dashboard/stat-card",
  ]);
  assertEquals(g.components["card"].composedBy, ["confirm-dialog", "settings"]);
});

Deno.test("REQ-026: the text map is one line per unit — pages, then shared, then page-local", async () => {
  const map = renderCompositionMap(await compositionGraph(FIXTURE));
  assertEquals(map.split("\n"), [
    "page dashboard → composes: confirm-dialog, dashboard/card, dashboard/stat-card, sparkline",
    "page settings → composes: card, confirm-dialog",
    "shared/card ← composed by: confirm-dialog, settings",
    "shared/confirm-dialog ← composed by: dashboard, settings; composes: card",
    "shared/sparkline ← composed by: dashboard, dashboard/stat-card",
    "dashboard/card ← composed by: dashboard",
    "dashboard/stat-card ← composed by: dashboard; composes: sparkline",
  ]);
});

Deno.test("REQ-026: the JSON form is stable (sorted keys) and round-trips", async () => {
  const g = await compositionGraph(FIXTURE);
  const json = compositionGraphJson(g);
  assertEquals(JSON.parse(json), g);
  assertEquals(Object.keys(JSON.parse(json).components), [
    "card",
    "confirm-dialog",
    "dashboard/card",
    "dashboard/stat-card",
    "sparkline",
  ]);
  assertEquals(json, compositionGraphJson(await compositionGraph(FIXTURE)));
});

Deno.test("REQ-024/REQ-025: assertComposition prints the allowed custom element, the opted-in shadow and what it checked", async () => {
  const lines: string[] = [];
  const r = await assertComposition(
    join(FIXTURE, "src"),
    "sprig check",
    (l) => lines.push(l),
  );
  assertEquals(r.errors, []);
  assertEquals(lines, [
    "sprig check: allowing <x-foo> (custom-elements)",
    "sprig check: dashboard/card shadows shared card: the dashboard card is a dense KPI tile, not the shared panel",
    "sprig check: composition — 7 template(s), 22 tag(s) against 7 component selector(s): every tag resolves, no undeclared shadowing.",
  ]);
});

Deno.test("REQ-024/REQ-025: assertComposition throws one error listing every offender", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprig-composition-" });
  try {
    await copy(FIXTURE, tmp, { overwrite: true });
    const page = join(tmp, "src/pages/settings/template.html");
    await Deno.writeTextFile(
      page,
      (await Deno.readTextFile(page)).replace("<card>", "<crad>").replace(
        "</card>",
        "</crad>",
      ),
    );
    const local = join(
      tmp,
      "src/pages/dashboard/components/card/template.html",
    );
    await Deno.writeTextFile(
      local,
      (await Deno.readTextFile(local)).replace(/^<!--[^\n]*\n/, ""),
    );
    const err = await assertRejects(() =>
      assertComposition(join(tmp, "src"), "sprig build", () => {})
    );
    const msg = (err as Error).message;
    assertStringIncludes(
      msg,
      "sprig build: composition check failed — 2 error(s)",
    );
    assertStringIncludes(
      msg,
      "src/pages/settings/template.html:3 error: unknown tag <crad>",
    );
    assertStringIncludes(msg, "did you mean <card>?");
    assertStringIncludes(
      msg,
      "page-local <card> (src/pages/dashboard/components/card) shadows the shared component <card> (src/shared/card)",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
