import { assert, assertEquals, assertRejects } from "#std/assert";
import {
  parseReport,
  runnerStatus,
  runSpec,
  runTests,
  specReason,
} from "./mod.ts";

const enc = (s: string) => new TextEncoder().encode(s);

// deno-lint-ignore no-explicit-any
const withSpec = (file: string): any => ({
  entries: [{
    cases: [{ name: "c", route: "/r", tests: [{ name: "t", file }] }],
  }],
  problems: [],
});

Deno.test("specReason — inside/outside/non-spec", () => {
  assertEquals(specReason("/root/a.spec.ts", "/root"), null);
  assert(specReason("/etc/passwd", "/root")?.includes("outside"));
  assert(specReason("/root/a.ts", "/root")?.includes(".spec"));
});

Deno.test("runTests — no selector + no specs => empty green report", async () => {
  const r = await runTests({ projectRoot: "/root" }, {
    discover: () => Promise.resolve({ entries: [], problems: [] }),
  });
  assertEquals(r, {
    ok: true,
    ran: false,
    total: 0,
    passed: 0,
    failed: 0,
    testResults: [],
    problems: [],
  });
});

Deno.test("runTests — selector matches zero => no-match", async () => {
  await assertRejects(
    () =>
      runTests({ projectRoot: "/root", filter: "zzz" }, {
        discover: () => Promise.resolve(withSpec("/root/a.spec.ts")),
      }),
    Error,
    "no-match",
  );
});

Deno.test("runTests — specs but no runner => runner-unavailable", async () => {
  await assertRejects(
    () =>
      runTests({ projectRoot: "/root", files: ["/root/a.spec.ts"] }, {
        runnerPresent: () => Promise.resolve(false),
      }),
    Error,
    "runner-unavailable",
  );
});

Deno.test("runTests — parses a Playwright JSON report", async () => {
  const json = JSON.stringify({
    suites: [{
      file: "/root/a.spec.ts",
      specs: [{ title: "adds", line: 3, ok: true, tests: [{ results: [{}] }] }],
    }],
  });
  const r = await runTests(
    { projectRoot: "/root", files: ["/root/a.spec.ts"] },
    {
      runnerPresent: () => Promise.resolve(true),
      runSpec: () => Promise.resolve({ stdout: enc(json), stderr: enc("") }),
    },
  );
  assertEquals(r.total, 1);
  assertEquals(r.passed, 1);
  assertEquals(r.ok, true);
  assertEquals(r.testResults[0].title, "adds");
});

Deno.test("runSpec — aborts and throws timeout", async () => {
  await assertRejects(
    () => runSpec("sleep", ["5"], {}, 50),
    Error,
    "timeout",
  );
});

Deno.test("parseReport — surfaces top-level load errors", () => {
  const json = JSON.stringify({
    suites: [],
    errors: [{ message: "Error: Cannot find package '@std/expect'" }],
  });
  const r = parseReport(enc(json), enc(""), new Map(), "/root");
  assertEquals(r.ok, false);
  assertEquals(r.ran, false);
  assertEquals(r.total, 0);
  assert(r.error?.includes("@std/expect"));
});

Deno.test("runTests — parsed-but-empty report carries the didn't-load hint", async () => {
  const r = await runTests(
    { projectRoot: "/root", files: ["/root/a.spec.ts"] },
    {
      runnerPresent: () => Promise.resolve(true),
      runSpec: () =>
        Promise.resolve({
          stdout: enc(JSON.stringify({ suites: [] })),
          stderr: enc(""),
        }),
    },
  );
  assertEquals(r.ran, false);
  assert(r.error?.includes("@playwright/test"));
  assert(r.error?.includes("1 spec file(s)"));
});

Deno.test("parseReport — counts failures", () => {
  const json = JSON.stringify({
    suites: [{
      file: "x.spec.ts",
      specs: [
        { title: "a", ok: true, tests: [{ results: [{}] }] },
        {
          title: "b",
          ok: false,
          tests: [{ results: [{ error: { message: "nope" } }] }],
        },
      ],
    }],
  });
  const r = parseReport(enc(json), enc(""), new Map(), "/root");
  assertEquals(r.total, 2);
  assertEquals(r.passed, 1);
  assertEquals(r.failed, 1);
  assertEquals(r.ok, false);
});

// --- REQ-007: the runner is wherever dir.ts resolves it — never a hardcoded ~/.isolate-runner ---

Deno.test("REQ-007: runnerStatus — reports the RESOLVED dir as `path`, and names it in the message", async () => {
  const s = await runnerStatus({
    env: { HOME: "/h", XDG_CACHE_HOME: "/xdg" },
    provisioned: () => Promise.resolve(false),
  });
  assertEquals(s.ok, false);
  assertEquals(s.path, "/xdg/sprig/isolate-runner");
  assert(s.message?.includes("/xdg/sprig/isolate-runner"), s.message);
  assert(!s.message?.includes("~/.isolate-runner"), s.message);
});

Deno.test("REQ-007: runnerStatus — a provisioned legacy dir is what existing installs report", async () => {
  const s = await runnerStatus({
    env: { HOME: "/h" },
    provisioned: (d) => Promise.resolve(d === "/h/.isolate-runner"),
  });
  assertEquals(s.ok, true);
  assertEquals(s.path, "/h/.isolate-runner");
});

Deno.test("REQ-007: runnerStatus — no HOME => not ok, and the message says HOME", async () => {
  const s = await runnerStatus({
    env: {},
    provisioned: () => Promise.resolve(false),
  });
  assertEquals(s.ok, false);
  assert(s.message?.includes("HOME"), s.message);
});

const oneGreenSpec = JSON.stringify({
  suites: [{
    file: "/root/a.spec.ts",
    specs: [{ title: "t", line: 1, ok: true, tests: [{ results: [{}] }] }],
  }],
});

Deno.test("REQ-007: runTests — spawns the resolved dir's playwright with NODE_PATH beside it", async () => {
  let seen: { bin: string; env: Record<string, string> } | undefined;
  await runTests({ projectRoot: "/root", files: ["/root/a.spec.ts"] }, {
    env: { HOME: "/h", XDG_CACHE_HOME: "/xdg" },
    provisioned: (d) => Promise.resolve(d === "/xdg/sprig/isolate-runner"),
    runSpec: (bin, _args, env) => {
      seen = { bin, env };
      return Promise.resolve({ stdout: enc(oneGreenSpec), stderr: enc("") });
    },
  });
  assertEquals(
    seen?.bin,
    "/xdg/sprig/isolate-runner/node_modules/.bin/playwright",
  );
  assertEquals(seen?.env.NODE_PATH, "/xdg/sprig/isolate-runner/node_modules");
});

Deno.test("REQ-007: runTests — a provisioned legacy ~/.isolate-runner keeps running (existing installs)", async () => {
  let bin = "";
  await runTests({ projectRoot: "/root", files: ["/root/a.spec.ts"] }, {
    env: { HOME: "/h", XDG_CACHE_HOME: "/xdg" },
    provisioned: (d) => Promise.resolve(d === "/h/.isolate-runner"),
    runSpec: (b) => {
      bin = b;
      return Promise.resolve({ stdout: enc(oneGreenSpec), stderr: enc("") });
    },
  });
  assertEquals(bin, "/h/.isolate-runner/node_modules/.bin/playwright");
});

Deno.test("REQ-007: runTests — nothing provisioned anywhere => runner-unavailable", async () => {
  await assertRejects(
    () =>
      runTests({ projectRoot: "/root", files: ["/root/a.spec.ts"] }, {
        env: { HOME: "/h" },
        provisioned: () => Promise.resolve(false),
      }),
    Error,
    "runner-unavailable",
  );
});
