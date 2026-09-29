// binding-drift (REQ-032): spec/contract/binding.md's `| unit | need | kind | endpoint | dto |`
// table against spec/contract/openapi.json — every endpoint exists (method + path, templates
// match), every DTO exists (components.schemas, or client/dtos.ts exports), every unit with
// dataNeeds has a row, and the `## Drift` section says "none".
import {
  type CheckResult,
  type Finding,
  type Inventory,
  result,
} from "./types.ts";

export const BINDING_HEADER = "| unit | need | kind | endpoint | dto |";
const HEADER_CELLS = ["unit", "need", "kind", "endpoint", "dto"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export interface BindingRow {
  /** 1-based line in binding.md. */
  line: number;
  unit: string;
  need: string;
  kind: string;
  endpoint: string;
  dto: string;
}

function cells(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const inner = t.endsWith("|") && t.length > 1 ? t.slice(1, -1) : t.slice(1);
  return inner.split("|").map((c) => c.trim());
}

function clean(cell: string): string {
  return cell.replace(/`/g, "").replace(/\s+/g, " ").trim();
}

/** The first table whose header is exactly unit|need|kind|endpoint|dto; its body rows. */
export function parseBindingTable(
  md: string,
): { headerFound: boolean; rows: BindingRow[] } {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => {
    const c = cells(l);
    return c !== null && c.length === 5 &&
      c.every((x, i) => x.toLowerCase() === HEADER_CELLS[i]);
  });
  if (start < 0) return { headerFound: false, rows: [] };
  const rows: BindingRow[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const c = cells(lines[i]);
    if (c === null) break;
    if (c.every((x) => /^:?-+:?$/.test(x) || x === "")) continue;
    const [unit, need, kind, endpoint, dto] = [0, 1, 2, 3, 4].map((k) =>
      clean(c[k] ?? "")
    );
    rows.push({
      line: i + 1,
      unit,
      need,
      kind: kind.toLowerCase(),
      endpoint,
      dto: dto.replace(/\[\]$/, ""),
    });
  }
  return { headerFound: true, rows };
}

/** The `## Drift` section: `found`, its entries (empty when it says "none"), `empty` when blank. */
export function parseDrift(
  md: string,
): { found: boolean; entries: string[]; empty?: true } {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^##\s+drift\b/i.test(l.trim()));
  if (start < 0) return { found: false, entries: [] };
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i].trim())) break;
    const t = lines[i].trim();
    if (t) body.push(t);
  }
  if (body.length === 0) return { found: true, entries: [], empty: true };
  const stripped = body.map((l) => l.replace(/^([-*+]|\d+\.)\s+/, "").trim());
  if (stripped.length === 1 && /^(drift:\s*)?none\.?$/i.test(stripped[0])) {
    return { found: true, entries: [] };
  }
  return { found: true, entries: stripped };
}

/** `GET /api/items?x=1` → { GET, /api/items }; null when there is no known method + path. */
export function parseEndpoint(
  s: string,
): { method: string; path: string } | null {
  const m = /^([A-Za-z]+)\s+(\/\S*)$/.exec(s.trim());
  if (!m) return null;
  const method = m[1].toUpperCase();
  if (!METHODS.includes(method)) return null;
  return { method, path: m[2].split("?")[0].split("#")[0] };
}

const isParam = (seg: string) =>
  /^\{[^}]+\}$/.test(seg) || /^:[^/]+$/.test(seg);
const segs = (p: string) =>
  p.replace(/\/+$/, "").split("/").filter((s, i) => i === 0 || s !== "");

/** Does a binding path hit an openapi path template? `{p}` in the template matches any
 *  segment; a binding param (`{id}`/`:id`) matches only a template param. */
export function pathMatches(template: string, path: string): boolean {
  const a = segs(template), b = segs(path);
  if (a.length !== b.length) return false;
  return a.every((t, i) => isParam(t) ? true : !isParam(b[i]) && t === b[i]);
}

/** The openapi path template that serves `method path`, or null. */
export function findOperation(
  openapi: unknown,
  method: string,
  path: string,
): string | null {
  const paths =
    (openapi as { paths?: Record<string, Record<string, unknown>> })?.paths ??
      {};
  const templates = Object.keys(paths);
  // A literal match wins over a template (/api/items/counts before /api/items/{id}).
  const ordered = [
    ...templates.filter((t) => !segs(t).some(isParam)),
    ...templates.filter((t) => segs(t).some(isParam)),
  ];
  for (const t of ordered) {
    if (!pathMatches(t, path)) continue;
    const item = paths[t] ?? {};
    if (Object.keys(item).some((k) => k.toUpperCase() === method)) return t;
  }
  return null;
}

/** Every exported type-ish name of a dtos.ts source. */
export function dtoExports(src: string): Set<string> {
  const out = new Set<string>();
  const decl =
    /export\s+(?:declare\s+)?(?:const\s+enum|enum|interface|type|class|abstract\s+class|const|let|function)\s+([A-Za-z_$][\w$]*)/g;
  for (const m of src.matchAll(decl)) out.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, "")
        .trim();
      if (name) out.add(name);
    }
  }
  return out;
}

const NO_DTO = new Set(["", "-", "—", "none", "n/a"]);

export function checkBinding(opts: {
  bindingText: string;
  bindingWhere: string;
  openapi: unknown;
  openapiWhere?: string;
  dtoNames?: Set<string>;
  dtosWhere?: string;
  inventory?: Inventory;
  read: string[];
}): CheckResult {
  const { bindingText, bindingWhere: bw, openapi, inventory } = opts;
  const oa = opts.openapiWhere ?? "spec/contract/openapi.json";
  const findings: Finding[] = [];
  const notes: string[] = [];
  const schemas = new Set(Object.keys(
    (openapi as { components?: { schemas?: Record<string, unknown> } })
      ?.components?.schemas ?? {},
  ));
  const dtoSource = opts.dtoNames
    ? `DTO names looked up in ${oa} components.schemas (${schemas.size}) and ${opts.dtosWhere} exports (${opts.dtoNames.size})`
    : `DTO names looked up in ${oa} components.schemas (${schemas.size}); no spec/contract/client/dtos.ts`;
  notes.push(dtoSource);

  const table = parseBindingTable(bindingText);
  if (!table.headerFound) {
    findings.push({
      where: bw,
      message:
        `no binding table — expected the exact header \`${BINDING_HEADER}\``,
      hint:
        "re-run the breakdown analyst's opening pass; it writes one row per unit data-need under that header",
    });
  }
  const units = new Map((inventory?.units ?? []).map((u) => [u.name, u]));
  for (const row of table.rows) {
    const where = `${bw}:${row.line}`;
    if (inventory && !units.has(row.unit)) {
      findings.push({
        where,
        message:
          `binding row names unit "${row.unit}", which inventory.json does not list`,
        hint:
          "rename the row to an inventory unit name, or add the unit to inventory.json",
      });
    }
    if (row.kind !== "query" && row.kind !== "command") {
      findings.push({
        where,
        message: `kind "${row.kind}" is neither query nor command`,
        hint: "reads bind to a query (GET), writes to a command verb",
      });
    }
    const ep = parseEndpoint(row.endpoint);
    if (!ep) {
      findings.push({
        where,
        message: `endpoint "${row.endpoint}" is not "<METHOD> /path"`,
        hint:
          "write it as e.g. `GET /api/items` or `POST /api/commands/markDone`",
      });
    } else {
      if (row.kind === "query" && ep.method !== "GET") {
        findings.push({
          where,
          message: `query "${row.need}" binds to ${ep.method}, not GET`,
          hint: "a read is a GET query endpoint; a write is a command",
        });
      }
      if (row.kind === "command" && ep.method === "GET") {
        findings.push({
          where,
          message: `command "${row.need}" binds to a GET`,
          hint: "a write binds to a command verb (POST /api/commands/<verb>)",
        });
      }
      if (!findOperation(openapi, ep.method, ep.path)) {
        const pathOnly = Object.keys(
          (openapi as { paths?: object })?.paths ?? {},
        ).find((t) => pathMatches(t, ep.path));
        findings.push({
          where,
          message: pathOnly
            ? `endpoint ${ep.method} ${ep.path}: ${oa} has ${pathOnly} but no ${ep.method} on it`
            : `endpoint ${ep.method} ${ep.path} is not in ${oa} paths`,
          hint:
            "bind to an endpoint the contract serves, or list the need under ## Drift and change the backend contract first",
        });
      }
    }
    if (
      !NO_DTO.has(row.dto.toLowerCase()) && !schemas.has(row.dto) &&
      !opts.dtoNames?.has(row.dto)
    ) {
      findings.push({
        where,
        message: `DTO ${row.dto} is not in ${oa} components.schemas${
          opts.dtoNames ? ` nor ${opts.dtosWhere} exports` : ""
        }`,
        hint:
          "name a DTO the contract defines; a missing DTO is drift, never an invented schema",
      });
    }
  }
  if (inventory) {
    const bound = new Set(table.rows.map((r) => r.unit));
    for (const u of inventory.units) {
      if (u.dataNeeds.length && !bound.has(u.name)) {
        findings.push({
          where: bw,
          message: `unit "${u.name}" has dataNeeds (${
            u.dataNeeds.join("; ")
          }) but no binding row`,
          hint:
            "bind each data-need to a query/command row, or list it under ## Drift",
        });
      }
    }
  } else {
    notes.push(
      "dataNeeds coverage and unit names not checked: no valid inventory.json",
    );
  }
  const drift = parseDrift(bindingText);
  if (!drift.found || drift.empty) {
    findings.push({
      where: bw,
      message: drift.found
        ? "the ## Drift section is blank"
        : "no ## Drift section",
      hint: 'the Drift section ships even when empty — write "none"',
    });
  }
  for (const e of drift.entries) {
    findings.push({
      where: `${bw} ## Drift`,
      message: `drift: ${e}`,
      hint:
        "resolve it in the contract (add the endpoint/DTO) or change the mock — the Drift list must be none",
    });
  }
  return result("binding-drift", opts.read, table.rows.length, findings, notes);
}
