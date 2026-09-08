// Reading back the auth slot an app already composed.
//
// `sprig build` regenerates the composition root from what the BUILD can see,
// and it can never see a third-party auth unit. Regenerating naively deleted
// `auth:` from an app that had one, and every guarded route came back open.
// So the build reads the app's own serve.ts first and carries its auth slot
// through. Lives in its own module so it is testable without running the CLI.

/**
 * The `auth:` slot of an already-generated composition root, if it has one.
 *
 * Read back from the file rather than inferred, because nothing else in the
 * build knows about it: the auth unit is the app's own choice, from a package
 * this build has never heard of. Returns undefined when there is no serve.ts,
 * no auth slot, or the file is shaped in a way we cannot read confidently — in
 * which case the caller keeps the app's file rather than guessing.
 */
export async function existingAuthSlot(
  servePath: string,
): Promise<{ from: string; symbol: string; expression: string } | undefined> {
  const src = await Deno.readTextFile(servePath).catch(() => "");
  if (!src) return undefined;
  // `auth: Infra()` / `auth: AlfredAuth()` / `auth: myUnit`
  const slot = src.match(/\bauth:\s*([A-Za-z_$][\w$]*)(\s*\([^)]*\))?/);
  if (!slot) return undefined;
  const symbol = slot[1];
  const imp = src.match(
    new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`),
  );
  if (!imp) return undefined;
  return { from: imp[1], symbol, expression: symbol + (slot[2]?.trim() ?? "") };
}
