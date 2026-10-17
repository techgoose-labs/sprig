// REQ-061 — a component named like a native HTML element (`base`, `button`, …)
// can never render: the renderer always emits the native element for that tag
// (a `<base>` is a void element with no box), so its preview page shows nothing
// and every check waits out its timeout. Discovery refuses it by name instead.
import { assertEquals, assertStringIncludes } from "#std/assert";
import { discover } from "./mod.ts";

async function project(names: string[]): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "req061-native-" });
  for (const n of names) {
    const iso = `${dir}/src/components/${n}/isolate`;
    await Deno.mkdir(`${iso}/cases/plain`, { recursive: true });
    await Deno.writeTextFile(
      `${dir}/src/components/${n}/template.html`,
      "<div>x</div>",
    );
    await Deno.writeTextFile(`${iso}/fixture.json`, "{}");
    await Deno.writeTextFile(`${iso}/cases/plain/plain.json`, "{}");
  }
  return dir;
}

Deno.test("REQ-061: a component named `base` is refused as a problem naming the native element, not discovered", async () => {
  const dir = await project(["base", "tile"]);
  try {
    const r = await discover(dir);
    assertEquals(r.entries.map((e) => e.label), ["tile"]);
    assertEquals(r.problems.length, 1);
    const p = r.problems[0];
    assertEquals(p.kind, "component-name");
    assertEquals(p.path, `${dir}/src/components/base/template.html`);
    assertStringIncludes(p.detail, "<base>");
    assertStringIncludes(p.detail, "native HTML element");
    assertStringIncludes(p.detail, "rename the folder");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("REQ-061: every native name and the renderer's reserved tags are refused; a custom name is not", async () => {
  const dir = await project([
    "button",
    "router-outlet",
    "content",
    "stat-card",
  ]);
  try {
    const r = await discover(dir);
    assertEquals(r.entries.map((e) => e.label), ["stat-card"]);
    assertEquals(
      r.problems.map((p) => [p.kind, p.path.split("/").at(-2)]),
      [
        ["component-name", "button"],
        ["component-name", "content"],
        ["component-name", "router-outlet"],
      ],
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
