// REQ-021 — the real script answers --plan with one path per line, each of the
// lane's own kind, and never an empty lane.
import { assert, assertEquals } from "@std/assert";
import { kindOf } from "./lane.ts";

async function plan(lane: string): Promise<string[]> {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "scripts/lane.ts", lane, "--plan"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(out.code, 0, new TextDecoder().decode(out.stderr));
  return new TextDecoder().decode(out.stdout).split("\n").filter((l) => l.trim() !== "");
}

for (const lane of ["unit", "int", "e2e"] as const) {
  Deno.test(`REQ-021: lane ${lane} --plan lists only ${lane} files, and some`, async () => {
    const files = await plan(lane);
    assert(files.length > 0, `${lane} lane is empty`);
    for (const f of files) {
      assertEquals(kindOf(f), lane, f);
      assert(await Deno.stat(f).then(() => true, () => false), `${f} is not a file`);
    }
  });
}

Deno.test("REQ-021: an unknown lane is refused, exit 2", async () => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "scripts/lane.ts", "smoke", "--plan"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(out.code, 2);
});
