// REQ-068 — where the source lints find the ratified contract: the app root (the
// dir holding deno.json) first, then the git root; the result says which.
import { assertEquals } from "@std/assert";
import { appRootOf, resolveContractRoot } from "./contract.ts";

const having = (...dirs: string[]) => (p: string) =>
  Promise.resolve(dirs.includes(p));

Deno.test("REQ-068: resolveContractRoot — the app root's spec/contract first, then the git root's, and says which", async () => {
  const roots = { appRoot: "/r/fixtures/kennel", gitRoot: "/r" };
  assertEquals(
    await resolveContractRoot(
      roots,
      having("/r/fixtures/kennel/spec/contract", "/r/spec/contract"),
    ),
    { dir: "/r/fixtures/kennel", via: "app root" },
  );
  assertEquals(
    await resolveContractRoot(roots, having("/r/spec/contract")),
    { dir: "/r", via: "git root" },
  );
  assertEquals(await resolveContractRoot(roots, having()), null);
  // the app IS the git root: one lookup, named the app root
  assertEquals(
    await resolveContractRoot(
      { appRoot: "/r", gitRoot: "/r" },
      having("/r/spec/contract"),
    ),
    { dir: "/r", via: "app root" },
  );
  // only a git root given (the pre-REQ-068 callers): the git root
  assertEquals(
    await resolveContractRoot({ gitRoot: "/r" }, having("/r/spec/contract")),
    { dir: "/r", via: "git root" },
  );
});

Deno.test("REQ-068: appRootOf — the nearest dir holding deno.json from the app dir up to the git root, else the app dir", async () => {
  const has = (...files: string[]) => (p: string) =>
    Promise.resolve(files.includes(p));
  assertEquals(
    await appRootOf(
      "/r/fixtures/kennel",
      "/r",
      has("/r/fixtures/kennel/deno.json"),
    ),
    "/r/fixtures/kennel",
  );
  assertEquals(
    await appRootOf(
      "/r/apps/web/ui",
      "/r",
      has("/r/apps/web/deno.jsonc", "/r/deno.json"),
    ),
    "/r/apps/web",
  );
  // only the git root holds one: the git root is the app root
  assertEquals(
    await appRootOf("/r/apps/web/ui", "/r", has("/r/deno.json")),
    "/r",
  );
  // nothing holds one: the app dir itself
  assertEquals(
    await appRootOf("/r/apps/web/ui", "/r", has()),
    "/r/apps/web/ui",
  );
});
