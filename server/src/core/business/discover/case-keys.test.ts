// REQ-039..045 — the case-key contract, at the parser: every `_` key a case JSON
// carries is either one isolate knows (and is validated) or an error naming it.
// Pure: parseCaseValues never touches the disk; paths resolve against caseDir.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import {
  DEFAULT_TOLERANCE,
  DEFAULT_VIEWPORT_HEIGHT,
  operationsFromOpenApi,
  parseCaseValues,
  pathPattern,
  resolveCaseFile,
} from "./mod.ts";

const CTX = { caseDir: "/p/src/components/btn/isolate/cases/big" };
const only = (errors: string[]) => errors.join("\n");

Deno.test("REQ-039: an unknown `_` key is an error naming the key — never ignored", () => {
  const v = parseCaseValues({ _name: "Big", _viewprt: 375, label: "x" }, CTX);
  assertEquals(v.errors.length, 1, only(v.errors));
  assertStringIncludes(v.errors[0], `"_viewprt"`);
  assertStringIncludes(v.errors[0], "_viewport"); // lists the known keys
  assertEquals(v.props, { label: "x" }); // bare keys still props
  assertEquals(v.label, "Big");
});

Deno.test("REQ-039: the known keys parse with no errors", () => {
  const v = parseCaseValues({
    _name: "n",
    _innerHtml: "<b>x</b>",
    _signals: { count: 1 },
    _mocks: { "ui-button": "stub" },
  }, CTX);
  assertEquals(v.errors, []);
  assertEquals(v.signals, { count: 1 });
});

Deno.test("REQ-040: _viewport — a number is a CSS px width at the default height", () => {
  const v = parseCaseValues({ _viewport: 375 }, CTX);
  assertEquals(v.errors, []);
  assertEquals(v.viewport, { width: 375, height: DEFAULT_VIEWPORT_HEIGHT });
});

Deno.test("REQ-040: _viewport — { width, height } is taken as given; junk is an error", () => {
  assertEquals(
    parseCaseValues({ _viewport: { width: 1024, height: 600 } }, CTX).viewport,
    { width: 1024, height: 600 },
  );
  for (const bad of [0, -5, "375", { width: 10 }, { width: 10, height: "x" }]) {
    const v = parseCaseValues({ _viewport: bad }, CTX);
    assertEquals(v.viewport, undefined);
    assertEquals(v.errors.length, 1, JSON.stringify(bad));
    assertStringIncludes(v.errors[0], "_viewport");
  }
});

Deno.test("REQ-041: _theme — a non-empty string; anything else is an error", () => {
  assertEquals(parseCaseValues({ _theme: "dark" }, CTX).theme, "dark");
  for (const bad of ["", 3, { t: 1 }]) {
    const v = parseCaseValues({ _theme: bad }, CTX);
    assertEquals(v.theme, undefined);
    assertStringIncludes(v.errors[0] ?? "", "_theme");
  }
});

Deno.test("REQ-042: _reference — a string is an image path relative to the case dir at the default tolerance", () => {
  const v = parseCaseValues({ _reference: "ref.png" }, CTX);
  assertEquals(v.errors, []);
  assertEquals(v.reference, {
    image: `${CTX.caseDir}/ref.png`,
    tolerance: DEFAULT_TOLERANCE,
  });
  assertEquals(DEFAULT_TOLERANCE, 0.01);
});

Deno.test("REQ-042: _reference — a tolerance above the default needs a reason", () => {
  const bad = parseCaseValues({
    _reference: { image: "ref.png", tolerance: 0.05 },
  }, CTX);
  assertEquals(bad.reference, undefined);
  assertEquals(bad.errors.length, 1);
  assertStringIncludes(bad.errors[0], "reason");
  assertStringIncludes(bad.errors[0], "0.05");

  const ok = parseCaseValues({
    _reference: {
      image: "../shared/ref.png",
      tolerance: 0.05,
      reason: "font hinting differs",
    },
  }, CTX);
  assertEquals(ok.errors, []);
  assertEquals(ok.reference, {
    image: "/p/src/components/btn/isolate/cases/shared/ref.png",
    tolerance: 0.05,
    reason: "font hinting differs",
  });
  // at or below the default, no reason is needed
  assertEquals(
    parseCaseValues({ _reference: { image: "r.png", tolerance: 0.002 } }, CTX)
      .errors,
    [],
  );
});

Deno.test("REQ-042: _reference — junk shapes are errors naming the key", () => {
  for (
    const bad of [3, "", { tolerance: 0.01 }, {
      image: "r.png",
      tolerance: 2,
      reason: "x",
    }, { image: "r.png", tolerance: -1 }]
  ) {
    const v = parseCaseValues({ _reference: bad }, CTX);
    assertEquals(v.reference, undefined, JSON.stringify(bad));
    assertStringIncludes(v.errors[0] ?? "", "_reference");
  }
});

Deno.test("REQ-043: _network — METHOD /path keys with fail | delay:<ms> | {status, body}", () => {
  const v = parseCaseValues({
    _network: {
      "POST /api/todos": "fail",
      "GET /api/todos/{id}": "delay:1500",
      "delete /api/todos/*": { status: 409, body: { error: "conflict" } },
    },
  }, CTX);
  assertEquals(v.errors, [], only(v.errors));
  assertEquals(v.network, [
    {
      key: "POST /api/todos",
      method: "POST",
      path: "/api/todos",
      pattern: "^/api/todos$",
      action: { kind: "fail" },
    },
    {
      key: "GET /api/todos/{id}",
      method: "GET",
      path: "/api/todos/{id}",
      pattern: "^/api/todos/[^/]+$",
      action: { kind: "delay", ms: 1500 },
    },
    {
      key: "delete /api/todos/*",
      method: "DELETE",
      path: "/api/todos/*",
      pattern: "^/api/todos/.*$",
      action: { kind: "respond", status: 409, body: { error: "conflict" } },
    },
  ]);
});

Deno.test("REQ-043: _network — a command name with no openapi.json is an error naming the key", () => {
  const v = parseCaseValues({ _network: { createTodo: "fail" } }, CTX);
  assertEquals(v.network, undefined);
  assertEquals(v.errors.length, 1);
  assertStringIncludes(v.errors[0], `"createTodo"`);
  assertStringIncludes(v.errors[0], "spec/contract/openapi.json");
});

Deno.test("REQ-043: _network — command names map through the contract's operationId", () => {
  const operations = operationsFromOpenApi({
    servers: [{ url: "/api" }],
    paths: {
      "/todos": {
        post: { operationId: "createTodo" },
        get: { operationId: "listTodos" },
      },
      "/todos/{id}": { delete: { operationId: "deleteTodo" } },
    },
  });
  const v = parseCaseValues({
    _network: { createTodo: "fail", deleteTodo: "delay:200" },
  }, { ...CTX, operations });
  assertEquals(v.errors, [], only(v.errors));
  assertEquals(v.network?.map((r) => [r.key, r.method, r.path, r.pattern]), [
    ["createTodo", "POST", "/api/todos", "^/api/todos$"],
    ["deleteTodo", "DELETE", "/api/todos/{id}", "^/api/todos/[^/]+$"],
  ]);
  const miss = parseCaseValues({ _network: { makeTodo: "fail" } }, {
    ...CTX,
    operations,
  });
  assertStringIncludes(miss.errors[0], `"makeTodo"`);
  assertStringIncludes(miss.errors[0], "createTodo"); // lists what exists
});

Deno.test("REQ-043: _network — bad keys and bad actions are errors naming the key", () => {
  const v = parseCaseValues({
    _network: {
      "FETCH /x": "fail",
      "POST api/x": "fail",
      "GET /a": "explode",
      "GET /b": "delay:soon",
      "GET /c": { status: 99 },
    },
  }, CTX);
  assertEquals(v.network, undefined);
  assertEquals(v.errors.length, 5, only(v.errors));
  for (const k of ["FETCH /x", "POST api/x", "GET /a", "GET /b", "GET /c"]) {
    assert(
      v.errors.some((e) => e.includes(`"${k}"`)),
      `${k}: ${only(v.errors)}`,
    );
  }
  assertStringIncludes(
    parseCaseValues({ _network: ["GET /a"] }, CTX).errors[0],
    "_network",
  );
});

Deno.test("REQ-043: pathPattern — {param}, :param and * segments", () => {
  assertEquals(pathPattern("/a/{id}/b"), "^/a/[^/]+/b$");
  assertEquals(pathPattern("/a/:id"), "^/a/[^/]+$");
  assertEquals(pathPattern("/a/*"), "^/a/.*$");
  assertEquals(pathPattern("/a.b"), "^/a\\.b$");
});

Deno.test("REQ-044: _tier — one of static | pure-client | optimistic-write | realtime", () => {
  for (const t of ["static", "pure-client", "optimistic-write", "realtime"]) {
    const v = parseCaseValues({ _tier: t }, CTX);
    assertEquals(v.errors, []);
    assertEquals(v.tier, t);
  }
  const bad = parseCaseValues({ _tier: "island" }, CTX);
  assertEquals(bad.tier, undefined);
  assertStringIncludes(bad.errors[0], "_tier");
  assertStringIncludes(bad.errors[0], "optimistic-write");
});

Deno.test("REQ-045: _motion — { spec } resolves relative to the case dir; junk is an error", () => {
  const v = parseCaseValues({ _motion: { spec: "motion.json" } }, CTX);
  assertEquals(v.errors, []);
  assertEquals(v.motion, { spec: `${CTX.caseDir}/motion.json` });
  for (const bad of ["motion.json", {}, { spec: 3 }]) {
    const b = parseCaseValues({ _motion: bad }, CTX);
    assertEquals(b.motion, undefined);
    assertStringIncludes(b.errors[0] ?? "", "_motion");
  }
});

Deno.test("REQ-042 AMENDMENT: resolveCaseFile — the case dir first, then the git root, else both paths tried", async () => {
  const have = (...ps: string[]) => (p: string) =>
    Promise.resolve(ps.includes(p));
  const caseDir = "/r/ui/src/x/isolate/cases/big";
  assertEquals(
    await resolveCaseFile(
      caseDir,
      "ref.png",
      "/r",
      have(`${caseDir}/ref.png`, "/r/ref.png"),
    ),
    { path: `${caseDir}/ref.png`, via: "case dir" },
  );
  assertEquals(
    await resolveCaseFile(
      caseDir,
      "spec/ui/breakdown/x/screenshots/a@375.png",
      "/r",
      have("/r/spec/ui/breakdown/x/screenshots/a@375.png"),
    ),
    { path: "/r/spec/ui/breakdown/x/screenshots/a@375.png", via: "git root" },
  );
  assertEquals(await resolveCaseFile(caseDir, "nope.png", "/r", have()), {
    tried: [`${caseDir}/nope.png`, "/r/nope.png"],
  });
  assertEquals(await resolveCaseFile(caseDir, "nope.png", null, have()), {
    tried: [`${caseDir}/nope.png`],
  });
});
