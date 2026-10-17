// The pipe-format cases need a UTC-negative TZ. TZ is process-global, and the
// lanes run `deno test --parallel` in one process (REQ-021 AMENDMENT), so the
// cases live in expr-pipe-format.la-tz.ts and run in a child deno with TZ set on
// ITS env — nothing here touches Deno.env.
import { assertEquals } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

Deno.test("pipe formats (percent, date-only ISO) under TZ=America/Los_Angeles, in a child process", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["test", "-A", "--no-check", join(here, "expr-pipe-format.la-tz.ts")],
    env: { TZ: "America/Los_Angeles" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  assertEquals(out.code, 0, text);
  assertEquals(/2 passed/.test(text), true, text);
});
