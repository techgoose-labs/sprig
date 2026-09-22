// The composed build and the app's deno.json — two rules (REQ-018, REQ-019).
//
// 1. A `start` task that already runs the composition root is the AUTHOR'S.
//    Whatever flags it carries (`--host 127.0.0.1`, `--unstable-kv`, a
//    `KV_PATH=…` prefix) survive every build. Only a task that cannot run the
//    composed root at all — 1.x's `deno run -A serve.ts`, a task serving some
//    other entry — is brought forward, and that is said out loud.
// 2. Every edit the workspace writer makes to a deno.json — the root's or a
//    member's — is printed, one line each: what was added, what was replaced
//    (old → new), what was hoisted out of a member and where it resolves now.
//    A build that changes nothing prints nothing.
//
// coms 20260922T231859Z-w208-84791: "sprig build rewrites the root deno.json
// 'start' task and silently drops flags … every build silently reintroduces
// the defect and nothing fails."

type Obj = Record<string, unknown>;

/** Deno's object task form: `{ "command": "…", "description": "…" }`. */
export interface TaskObject {
  command: string;
  [k: string]: unknown;
}

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Does this task run the composition root? `deno serve` on the git-root
 *  `serve.ts` (any flags, any env prefix, `./serve.ts` too, more commands
 *  around it) or `sprig serve`. Such a task is the author's: the composed
 *  build passes it through unchanged (REQ-018). Anything else — `deno run`
 *  (1.x: serve.ts listened itself), a different entry, no task — is stale. */
export function runsCompositionRoot(
  task: unknown,
): task is string | TaskObject {
  const cmd = typeof task === "string"
    ? task
    : isObj(task) && typeof task.command === "string"
    ? task.command
    : null;
  if (cmd === null) return false;
  return /(?:^|[\s;&|])deno\s+serve\b[^;&|]*?\s(?:\.\/)?serve\.ts(?=$|[\s;&|"'])/
    .test(cmd) ||
    /(?:^|[\s;&|])sprig\s+serve\b/.test(cmd);
}

/** The command a task runs, for the summary line (`deno task start` → this). */
export function taskCommand(task: unknown): string {
  return typeof task === "string"
    ? task
    : isObj(task) && typeof task.command === "string"
    ? task.command
    : JSON.stringify(task);
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const show = (v: unknown): string =>
  Array.isArray(v)
    ? v.map((x) => JSON.stringify(x)).join(", ")
    : JSON.stringify(v);

/** One line per edit between two readings of a deno.json — `label: + key
 *  value`, `label: - key value`, `label: key old → new` — at the depth the
 *  workspace writer edits (top-level scalars/arrays, one level of object
 *  keys). `notes[key]` is appended in parentheses: the WHY of a hoist or a
 *  replacement. Same config in and out → `[]` (REQ-019). */
export function describeConfigEdits(
  label: string,
  before: unknown,
  after: unknown,
  notes: Record<string, string> = {},
): string[] {
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  const lines: string[] = [];
  const note = (key: string) => notes[key] ? ` (${notes[key]})` : "";
  const edit = (key: string, x: unknown, y: unknown) => {
    if (x === undefined) {
      lines.push(`${label}: + ${key} ${show(y)}${note(key)}`);
    } else if (y === undefined) {
      lines.push(`${label}: - ${key} ${show(x)}${note(key)}`);
    } else lines.push(`${label}: ${key} ${show(x)} → ${show(y)}${note(key)}`);
  };
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const x = b[key], y = a[key];
    if (same(x, y)) continue;
    if (isObj(x) || isObj(y)) {
      const xo = isObj(x) ? x : {}, yo = isObj(y) ? y : {};
      for (const k of new Set([...Object.keys(xo), ...Object.keys(yo)])) {
        if (!same(xo[k], yo[k])) edit(`${key}.${k}`, xo[k], yo[k]);
      }
    } else if (Array.isArray(x) || Array.isArray(y)) {
      const xa = Array.isArray(x) ? x : [], ya = Array.isArray(y) ? y : [];
      const added = ya.filter((v) => !xa.some((w) => same(v, w)));
      const gone = xa.filter((v) => !ya.some((w) => same(v, w)));
      if (added.length) {
        lines.push(`${label}: + ${key} ${show(added)}${note(key)}`);
      }
      if (gone.length) {
        lines.push(`${label}: - ${key} ${show(gone)}${note(key)}`);
      }
    } else edit(key, x, y);
  }
  return lines;
}
