// REQ-007 (unit) — ONE rule says where the Playwright runner lives:
//   ISOLATE_RUNNER_HOME  >  $XDG_CACHE_HOME/sprig/isolate-runner (~/.cache default)
//   >  the legacy ~/.isolate-runner, ONLY when it is already provisioned.
// Pure: env is a plain object, "provisioned?" is injected. No fs, no HOME games.
import { assertEquals } from "#std/assert";
import {
  nodeModulesDir,
  playwrightBin,
  resolveRunnerDir,
  runnerDirCandidates,
} from "./dir.ts";

const never = () => Promise.resolve(false);
const only = (dir: string) => (d: string) => Promise.resolve(d === dir);

Deno.test("REQ-007: candidates — XDG_CACHE_HOME wins over ~/.cache; legacy is ~/.isolate-runner", () => {
  assertEquals(runnerDirCandidates({ HOME: "/h", XDG_CACHE_HOME: "/xdg" }), {
    preferred: "/xdg/sprig/isolate-runner",
    legacy: "/h/.isolate-runner",
  });
  assertEquals(runnerDirCandidates({ HOME: "/h" }), {
    preferred: "/h/.cache/sprig/isolate-runner",
    legacy: "/h/.isolate-runner",
  });
});

Deno.test("REQ-007: candidates — USERPROFILE stands in for HOME; a relative XDG_CACHE_HOME is ignored (XDG spec)", () => {
  assertEquals(
    runnerDirCandidates({ USERPROFILE: "/u" }).preferred,
    "/u/.cache/sprig/isolate-runner",
  );
  assertEquals(
    runnerDirCandidates({ HOME: "/h", XDG_CACHE_HOME: "rel/cache" }).preferred,
    "/h/.cache/sprig/isolate-runner",
  );
  assertEquals(
    runnerDirCandidates({ HOME: "/h", XDG_CACHE_HOME: "" }).preferred,
    "/h/.cache/sprig/isolate-runner",
  );
});

Deno.test("REQ-007: candidates — no HOME at all => nothing to resolve; XDG alone still names the preferred dir", () => {
  assertEquals(runnerDirCandidates({}), { preferred: null, legacy: null });
  assertEquals(runnerDirCandidates({ XDG_CACHE_HOME: "/xdg" }), {
    preferred: "/xdg/sprig/isolate-runner",
    legacy: null,
  });
});

Deno.test("REQ-007: resolve — a fresh machine gets the preferred (cache) dir, never the legacy one", async () => {
  assertEquals(
    await resolveRunnerDir({ HOME: "/h", XDG_CACHE_HOME: "/xdg" }, never),
    "/xdg/sprig/isolate-runner",
  );
  assertEquals(
    await resolveRunnerDir({ HOME: "/h" }, never),
    "/h/.cache/sprig/isolate-runner",
  );
});

Deno.test("REQ-007: resolve — a provisioned legacy ~/.isolate-runner is reused (existing installs, no re-download)", async () => {
  assertEquals(
    await resolveRunnerDir(
      { HOME: "/h", XDG_CACHE_HOME: "/xdg" },
      only("/h/.isolate-runner"),
    ),
    "/h/.isolate-runner",
  );
});

Deno.test("REQ-007: resolve — a provisioned preferred dir beats a provisioned legacy one", async () => {
  const both = (d: string) =>
    Promise.resolve(
      d === "/h/.isolate-runner" || d === "/xdg/sprig/isolate-runner",
    );
  assertEquals(
    await resolveRunnerDir({ HOME: "/h", XDG_CACHE_HOME: "/xdg" }, both),
    "/xdg/sprig/isolate-runner",
  );
});

Deno.test("REQ-007: resolve — ISOLATE_RUNNER_HOME is used as given, over everything; empty means unset", async () => {
  assertEquals(
    await resolveRunnerDir(
      {
        HOME: "/h",
        XDG_CACHE_HOME: "/xdg",
        ISOLATE_RUNNER_HOME: "/explicit/runner",
      },
      only("/h/.isolate-runner"),
    ),
    "/explicit/runner",
  );
  assertEquals(
    await resolveRunnerDir({ HOME: "/h", ISOLATE_RUNNER_HOME: "" }, never),
    "/h/.cache/sprig/isolate-runner",
  );
});

Deno.test("REQ-007: resolve — no HOME and no override => null (callers say so instead of guessing)", async () => {
  assertEquals(await resolveRunnerDir({}, never), null);
});

Deno.test("REQ-007: the runner's layout hangs off the resolved dir", () => {
  assertEquals(nodeModulesDir("/r"), "/r/node_modules");
  assertEquals(playwrightBin("/r"), "/r/node_modules/.bin/playwright");
});
