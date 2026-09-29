/**
 * The ONE reader of an app's ratified contract for the source lints:
 * `<gitRoot>/spec/contract/openapi.json` → every operation by its operationId,
 * with its HTTP method and path. contract-calls (REQ-054: the waist at the call
 * site) and optimistic-writes (REQ-030: is `client.<op>()` a write?) both read
 * it through here.
 */
import { join } from "@std/path";

/** One contract operation: its method (upper-case) and its path template. */
export type ContractOp = { method: string; path: string };

/** Where the contract lives under a git root. */
export const OPENAPI_REL = "spec/contract/openapi.json";

/** operationId → { method, path } from `<gitRoot>/spec/contract/openapi.json`;
 *  null when there is no gitRoot, no file, or it is not JSON. */
export async function readContractOps(
  gitRoot: string | undefined,
): Promise<Map<string, ContractOp> | null> {
  if (!gitRoot) return null;
  let doc: {
    paths?: Record<string, Record<string, { operationId?: string }>>;
  };
  try {
    doc = JSON.parse(
      await Deno.readTextFile(join(gitRoot, ...OPENAPI_REL.split("/"))),
    );
  } catch {
    return null;
  }
  const ops = new Map<string, ContractOp>();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, op] of Object.entries(item ?? {})) {
      if (op && typeof op === "object" && op.operationId) {
        ops.set(op.operationId, { method: method.toUpperCase(), path });
      }
    }
  }
  return ops;
}
