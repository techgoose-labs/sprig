// The motion compare behind a case's `_motion` (REQ-045). A motion spec is the
// breakdown's captured `document.getAnimations()` output; the build's rendered
// case is read the same way, and each animation's duration, easing and
// keyframe count must match (plus delay/iterations when the spec records them).

export interface MotionRecord {
  selector?: string;
  name?: string;
  duration: number;
  easing: string;
  keyframeCount: number;
  delay?: number;
  iterations?: number;
}

/** Durations/delays within this many ms are equal (timer rounding). */
const MS_TOLERANCE = 1;

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : v === "Infinity" || v === null || v === Infinity
    ? Infinity
    : undefined;

/** Lowercase, drop whitespace, and respell numbers so `.4` equals `0.4`. */
export function normalizeEasing(e: string): string {
  return e.trim().toLowerCase().replace(/\s+/g, "").replace(
    /-?\d*\.?\d+/g,
    (n) => String(Number(n)),
  );
}

/** A CSS animation's timing easing is "linear" and its real curve sits on the
 *  keyframes — take a uniform keyframe easing when the timing one is linear. */
function effectiveEasing(timing: unknown, keyframes: unknown[]): string {
  const t = typeof timing === "string" ? timing : "linear";
  if (normalizeEasing(t) !== "linear") return t;
  const kf = keyframes.map((k) => isObj(k) ? k.easing : undefined)
    .filter((e): e is string => typeof e === "string");
  const first = kf[0];
  return first && kf.every((e) => normalizeEasing(e) === normalizeEasing(first))
    ? first
    : t;
}

/** Read a motion spec: an array of records (or `{ animations: [...] }`), each in
 *  the flat schema or the breakdown's raw capture form. Extra fields are ignored. */
export function readMotionRecords(doc: unknown): MotionRecord[] {
  const list = Array.isArray(doc)
    ? doc
    : isObj(doc) && Array.isArray(doc.animations)
    ? doc.animations
    : null;
  if (!list) {
    throw new Error('not an array of animations (nor { "animations": [...] })');
  }
  return list.filter(isObj).map((a) => {
    const timing = isObj(a.timing) ? a.timing : {};
    const keyframes = Array.isArray(a.keyframes) ? a.keyframes : [];
    const rec: MotionRecord = {
      duration: num(a.duration ?? timing.duration) ?? 0,
      easing: typeof a.easing === "string"
        ? a.easing
        : effectiveEasing(timing.easing, keyframes),
      keyframeCount: num(a.keyframeCount) ?? keyframes.length,
    };
    const selector = a.selector ?? a.target;
    if (typeof selector === "string") rec.selector = selector;
    if (typeof a.name === "string") rec.name = a.name;
    const delay = num(a.delay ?? timing.delay);
    if (delay !== undefined) rec.delay = delay;
    if ("iterations" in a || "iterations" in timing) {
      rec.iterations = num(a.iterations ?? timing.iterations) ?? Infinity;
    }
    const ordered: MotionRecord = {} as MotionRecord;
    for (
      const k of [
        "selector",
        "name",
        "duration",
        "easing",
        "keyframeCount",
        "delay",
        "iterations",
      ] as const
    ) {
      if (rec[k] !== undefined) (ordered as unknown as Loose)[k] = rec[k];
    }
    return ordered;
  });
}

const label = (r: MotionRecord, i: number) =>
  [r.name, r.selector].filter(Boolean).join(" on ") || `animation #${i + 1}`;

export interface MotionComparison {
  ok: boolean;
  differences: string[];
  summary: string;
}

/** Pair spec animations with rendered ones (selector+name, then name, then order)
 *  and name every difference. */
export function compareMotion(
  spec: MotionRecord[],
  actual: MotionRecord[],
): MotionComparison {
  const free = actual.map((_, i) => i);
  const take = (pred: (a: MotionRecord) => boolean) => {
    const at = free.findIndex((i) => pred(actual[i]));
    return at < 0 ? undefined : actual[free.splice(at, 1)[0]];
  };
  const differences: string[] = [];
  spec.forEach((s, i) => {
    const got = (s.selector && s.name
      ? take((a) =>
        a.selector === s.selector && a.name === s.name
      )
      : undefined) ??
      (s.name ? take((a) => a.name === s.name) : undefined) ??
      (s.selector ? take((a) => a.selector === s.selector) : undefined) ??
      (!s.name && !s.selector ? take(() => true) : undefined);
    const what = label(s, i);
    if (!got) {
      differences.push(
        `${what}: missing — the rendered case has no such animation`,
      );
      return;
    }
    if (Math.abs(got.duration - s.duration) > MS_TOLERANCE) {
      differences.push(
        `${what}: duration ${got.duration}ms ≠ spec ${s.duration}ms`,
      );
    }
    if (normalizeEasing(got.easing) !== normalizeEasing(s.easing)) {
      differences.push(`${what}: easing "${got.easing}" ≠ spec "${s.easing}"`);
    }
    if (got.keyframeCount !== s.keyframeCount) {
      differences.push(
        `${what}: ${got.keyframeCount} keyframes ≠ spec ${s.keyframeCount}`,
      );
    }
    if (
      s.delay !== undefined && got.delay !== undefined &&
      Math.abs(got.delay - s.delay) > MS_TOLERANCE
    ) {
      differences.push(`${what}: delay ${got.delay}ms ≠ spec ${s.delay}ms`);
    }
    if (
      s.iterations !== undefined && got.iterations !== undefined &&
      got.iterations !== s.iterations
    ) {
      differences.push(
        `${what}: iterations ${got.iterations} ≠ spec ${s.iterations}`,
      );
    }
  });
  for (const i of free) {
    differences.push(
      `${label(actual[i], i)}: unexpected — rendered but not in the spec`,
    );
  }
  return {
    ok: differences.length === 0,
    differences,
    summary:
      `compared ${spec.length} spec animation(s) with ${actual.length} rendered ` +
      `(duration ±${MS_TOLERANCE}ms, easing, keyframe count)`,
  };
}
