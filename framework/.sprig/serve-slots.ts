// Reading back the units an app already composed — the `ui:` and `auth:` slots
// of its `Bedrock({ ui, backend, auth })` root.
//
// `sprig build` regenerates the composition root from what the BUILD can see,
// and it can see exactly one slot: the backend it just composed. It cannot see a
// third-party auth unit, and it cannot see an app's own ui unit. Regenerating
// naively deleted `auth:` from an app that had one, and every guarded route came
// back open; it deleted a custom `ui:` the same way — the app's own Frontend,
// with the routes and the config publication that hang off it, replaced by a
// plain `Frontend()` on every build (REQ-012, coms 20260921T184230Z-w5-73419).
// So the build reads the app's own slots back off the file and writes them
// again. A build must never remove what it cannot see.
//
// Whether the file may be rewritten at all is the OTHER question, and it is
// `serve-marker.ts` (REQ-010).
//
// Lives in its own module so it is testable without running the CLI.

/** One slot of `Bedrock({ ui, backend, auth })`, as read back off the file. */
export interface ServeSlot {
  from: string;
  symbol: string;
  expression: string;
}

/** The argument list starting at `src[open]` (which must be `(`), balanced —
 *  `undefined` when it never closes. Quoted text is skipped so a `)` inside a
 *  string doesn't end it early. A naive `\([^)]*\)` truncates
 *  `Frontend({ app: build({ x: 1 }) })` into a file that does not parse. */
function balancedArgs(src: string, open: number): string | undefined {
  let depth = 0;
  let quote = "";
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return undefined;
}

/**
 * The `<slot>:` unit of an already-composed root, if it has one.
 *
 * Read back from the source rather than inferred, because nothing else in the
 * build knows about it: the unit is the app's own choice, often from a package
 * this build has never heard of. Returns undefined when there is no such slot,
 * or the file is shaped in a way we cannot read confidently — in which case the
 * caller falls back to its own default rather than guessing.
 */
export function readSlot(src: string, slot: string): ServeSlot | undefined {
  // `ui: Frontend()` / `auth: AlfredAuth()` / `auth: myUnit`
  const at = src.match(new RegExp(`\\b${slot}:\\s*([A-Za-z_$][\\w$]*)`));
  if (!at || at.index === undefined) return undefined;
  const symbol = at[1];
  const rest = src.slice(at.index + at[0].length);
  const call = rest.match(/^\s*\(/);
  let args = "";
  if (call) {
    const balanced = balancedArgs(rest, call[0].length - 1);
    if (balanced === undefined) return undefined; // half a call is worse than none
    args = balanced;
  }
  const imp = src.match(
    new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`),
  );
  if (!imp) return undefined;
  return { from: imp[1], symbol, expression: symbol + args };
}

async function slotOf(
  servePath: string,
  slot: string,
): Promise<ServeSlot | undefined> {
  const src = await Deno.readTextFile(servePath).catch(() => "");
  return src ? readSlot(src, slot) : undefined;
}

/** The `auth:` slot of an already-composed root — carried across every build,
 *  because losing it reopens every guarded route. */
export function existingAuthSlot(
  servePath: string,
): Promise<ServeSlot | undefined> {
  return slotOf(servePath, "auth");
}

/** The `ui:` slot of an already-composed root — carried across every build. The
 *  build's own `Frontend()` is only the DEFAULT, for a root that composes no ui
 *  unit of its own. */
export function existingUiSlot(
  servePath: string,
): Promise<ServeSlot | undefined> {
  return slotOf(servePath, "ui");
}
