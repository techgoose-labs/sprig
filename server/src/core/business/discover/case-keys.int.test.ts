// REQ-039..045 (integration) — discover() on real files: every case key lands on
// the CaseDef, and every bad one is a "case-key" problem naming the key and the
// case file (unknown keys, a missing reference image, an unreadable motion spec,
// a command name with no contract). Command names map through the git root's
// spec/contract/openapi.json.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { fromFileUrl, join } from "#std/path";
import { discover } from "./mod.ts";

const FIXTURE = fromFileUrl(
  new URL("../../../../../fixtures/isolate/case-keys-app", import.meta.url),
);

async function project(cases: Record<string, unknown>): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "w3-discover-" });
  const comp = join(dir, "src", "components", "btn");
  await Deno.mkdir(comp, { recursive: true });
  await Deno.writeTextFile(join(comp, "template.html"), "<button>x</button>");
  for (const [name, json] of Object.entries(cases)) {
    const c = join(comp, "isolate", "cases", name);
    await Deno.mkdir(c, { recursive: true });
    await Deno.writeTextFile(join(c, `${name}.json`), JSON.stringify(json));
  }
  return dir;
}

Deno.test("REQ-040..045: the fixture app discovers clean, every key on its case", async () => {
  const r = await discover(FIXTURE);
  assertEquals(r.problems, []);
  const byKey = new Map(
    r.entries.flatMap((e) => e.cases.map((c) => [`${e.label}/${c.name}`, c])),
  );
  const match = byKey.get("swatch/match")!;
  assertEquals(match.viewport, { width: 375, height: 720 });
  assertEquals(match.tier, "static");
  assertEquals(match.reference?.image, join(match.jsonPath, "..", "ref.png"));
  assertEquals(byKey.get("swatch/dark")!.theme, "dark");
  assertEquals(byKey.get("saver/fail")!.network?.[0].action, { kind: "fail" });
  assertEquals(byKey.get("saver/slow")!.network?.[0].action, {
    kind: "delay",
    ms: 4000,
  });
  assertEquals(byKey.get("saver/fail")!.tier, "optimistic-write");
  assert(
    byKey.get("pulse/motion-ok")!.motion?.spec.endsWith(
      "motion-ok/motion.json",
    ),
  );
});

Deno.test("REQ-039: an unknown key is a case-key problem naming the key and the case file", async () => {
  const dir = await project({ big: { _viewprt: 375 } });
  try {
    const r = await discover(dir);
    assertEquals(r.problems.length, 1);
    const p = r.problems[0];
    assertEquals(p.kind, "case-key");
    assert(p.path.endsWith("cases/big/big.json"), p.path);
    assertStringIncludes(p.detail, `"_viewprt"`);
    assertStringIncludes(p.detail, p.path);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-042/045: a missing reference image or an unreadable motion spec is a problem at discovery", async () => {
  const dir = await project({
    a: { _reference: "nope.png" },
    b: { _motion: { spec: "nope.json" } },
  });
  try {
    const r = await discover(dir);
    const details = r.problems.map((p) => `${p.kind}: ${p.detail}`).join("\n");
    assertEquals(r.problems.length, 2, details);
    assertStringIncludes(details, `case-key: "_reference" image not found`);
    assertStringIncludes(details, `case-key: "_motion" spec`);
    assertEquals(
      r.entries[0].cases.every((c) => !c.reference && !c.motion),
      true,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-043: command names resolve through <git root>/spec/contract/openapi.json", async () => {
  const dir = await project({ n: { _network: { createTodo: "fail" } } });
  try {
    // without a contract: an error naming the key
    const before = await discover(dir);
    assertStringIncludes(before.problems[0]?.detail ?? "", `"createTodo"`);
    // a git root with a contract above the project
    await Deno.mkdir(join(dir, ".git"));
    await Deno.mkdir(join(dir, "spec", "contract"), { recursive: true });
    await Deno.writeTextFile(
      join(dir, "spec", "contract", "openapi.json"),
      JSON.stringify({
        servers: [{ url: "http://localhost:8000/api" }],
        paths: { "/todo/create": { post: { operationId: "createTodo" } } },
      }),
    );
    const after = await discover(dir);
    assertEquals(after.problems, []);
    const rule = after.entries[0].cases[0].network![0];
    assertEquals([rule.method, rule.path], ["POST", "/api/todo/create"]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-042 AMENDMENT: a git-root-relative _reference / _motion.spec resolves; neither found names both paths", async () => {
  const dir = await project({
    ok: {
      _reference: "spec/ui/breakdown/btn/screenshots/btn@375.png",
      _motion: { spec: "spec/ui/breakdown/btn/screenshots/motion.json" },
    },
    gone: { _reference: "spec/ui/breakdown/btn/screenshots/none.png" },
  });
  try {
    await Deno.mkdir(join(dir, ".git"));
    const shots = join(dir, "spec", "ui", "breakdown", "btn", "screenshots");
    await Deno.mkdir(shots, { recursive: true });
    await Deno.writeFile(join(shots, "btn@375.png"), new Uint8Array([1]));
    await Deno.writeTextFile(join(shots, "motion.json"), "[]");
    const r = await discover(dir);
    const ok = r.entries[0].cases.find((c) => c.name === "ok")!;
    assertEquals(ok.reference?.image, join(shots, "btn@375.png"));
    // REQ-063: the app IS the git root here — the app root answers first
    assertEquals(ok.reference?.via, "app root");
    assertEquals(ok.motion?.spec, join(shots, "motion.json"));
    assertEquals(ok.motion?.via, "app root");
    assertEquals(r.problems.length, 1);
    const d = r.problems[0].detail;
    assertStringIncludes(
      d,
      join(
        dir,
        "src/components/btn/isolate/cases/gone/spec/ui/breakdown/btn/screenshots/none.png",
      ),
    );
    assertStringIncludes(d, join(shots, "none.png"));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-063: an app below the git root — stills and the contract resolve against the --root app first, then the git root, and say which", async () => {
  const repo = await Deno.makeTempDir({ prefix: "req063-discover-" });
  try {
    await Deno.mkdir(join(repo, ".git"));
    const app = join(repo, "fixtures", "web");
    const comp = join(app, "src", "components", "btn");
    const cases = {
      mine: {
        _reference: "spec/ui/breakdown/btn/screenshots/btn@375.png",
        _motion: {
          spec: "spec/ui/breakdown/btn/screenshots/motion.json",
          trigger: "hover",
        },
        _network: { createTodo: "fail" },
      },
      repo: { _reference: "spec/shared/repo.png" },
    };
    await Deno.mkdir(comp, { recursive: true });
    await Deno.writeTextFile(join(comp, "template.html"), "<b>x</b>");
    for (const [name, json] of Object.entries(cases)) {
      const c = join(comp, "isolate", "cases", name);
      await Deno.mkdir(c, { recursive: true });
      await Deno.writeTextFile(join(c, `${name}.json`), JSON.stringify(json));
    }
    // the app's own breakdown + contract (what the breakdown wrote, app-relative)
    const shots = join(app, "spec", "ui", "breakdown", "btn", "screenshots");
    await Deno.mkdir(shots, { recursive: true });
    await Deno.writeFile(join(shots, "btn@375.png"), new Uint8Array([1]));
    await Deno.writeTextFile(join(shots, "motion.json"), "[]");
    await Deno.mkdir(join(app, "spec", "contract"), { recursive: true });
    await Deno.writeTextFile(
      join(app, "spec", "contract", "openapi.json"),
      JSON.stringify({
        servers: [{ url: "http://localhost:8000/api" }],
        paths: { "/todo/create": { post: { operationId: "createTodo" } } },
      }),
    );
    // a repo-level still only the git root has
    await Deno.mkdir(join(repo, "spec", "shared"), { recursive: true });
    await Deno.writeFile(
      join(repo, "spec/shared/repo.png"),
      new Uint8Array([1]),
    );

    const r = await discover(app);
    assertEquals(r.problems, []);
    const by = (n: string) => r.entries[0].cases.find((c) => c.name === n)!;
    assertEquals(by("mine").reference?.image, join(shots, "btn@375.png"));
    assertEquals(by("mine").reference?.via, "app root");
    assertEquals(by("mine").motion, {
      spec: join(shots, "motion.json"),
      via: "app root",
      trigger: "hover",
    });
    const rule = by("mine").network![0];
    assertEquals([rule.method, rule.path, rule.via], [
      "POST",
      "/api/todo/create",
      "app root",
    ]);
    assertEquals(
      by("repo").reference?.image,
      join(repo, "spec/shared/repo.png"),
    );
    assertEquals(by("repo").reference?.via, "git root");
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
});

Deno.test("REQ-068: a case's _network may name a command by its x-sprig-command (dog.checkIn) — discover maps it through the app root's contract", async () => {
  const repo = await Deno.makeTempDir({ prefix: "req068-discover-" });
  try {
    await Deno.mkdir(join(repo, ".git"));
    const app = join(repo, "fixtures", "kennel");
    const comp = join(app, "src", "components", "dog-actions");
    await Deno.mkdir(comp, { recursive: true });
    await Deno.writeTextFile(join(comp, "template.html"), "<b>x</b>");
    const cases = {
      dotted: { _network: { "dog.checkIn": "fail" } },
      unknown: { _network: { "dog.fetch": "fail" } },
    };
    for (const [name, json] of Object.entries(cases)) {
      const c = join(comp, "isolate", "cases", name);
      await Deno.mkdir(c, { recursive: true });
      await Deno.writeTextFile(join(c, `${name}.json`), JSON.stringify(json));
    }
    await Deno.mkdir(join(app, "spec", "contract"), { recursive: true });
    await Deno.writeTextFile(
      join(app, "spec", "contract", "openapi.json"),
      JSON.stringify({
        servers: [{ url: "http://localhost:8000/api" }],
        paths: {
          "/dog/check-in": {
            post: {
              operationId: "dogCheckIn",
              "x-sprig-command": "dog.checkIn",
            },
          },
        },
      }),
    );
    const r = await discover(app);
    const dotted = r.entries[0].cases.find((c) => c.name === "dotted")!;
    const rule = dotted.network![0];
    assertEquals([rule.key, rule.method, rule.path, rule.via], [
      "dog.checkIn",
      "POST",
      "/api/dog/check-in",
      "app root",
    ]);
    assertEquals(r.problems.length, 1, JSON.stringify(r.problems));
    assertStringIncludes(r.problems[0].detail, `"dog.fetch"`);
    assertStringIncludes(
      r.problems[0].detail,
      "neither an operationId nor an x-sprig-command",
    );
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
});
