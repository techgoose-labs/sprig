import { effect, signal } from "@techgoose-labs/sprig";

/** One queued message — writers push these onto the page's `toasts` channel. */
export interface Toast {
  kind: "error" | "success";
  msg: string;
}

/** Per-instance browser handles (timers, effect disposer) — kept off the
 * instance so nothing live crosses the SSR→client wire. */
interface Handles {
  timers: Map<Toast, ReturnType<typeof setTimeout>>;
  stop?: () => void;
}
const handles = new WeakMap<ToastStack, Handles>();

const reducedMotion = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * toast-stack — the page's transient feedback queue. Owns the `toasts` channel
 * (`sets:toasts` on the page); writers `edits:toasts` and append entries. Each
 * entry lives `lifetime` ms from the moment it enters the queue, then leaves
 * (exit animation, or at once under reduced motion).
 */
export default class ToastStack {
  lifetime = 3500;
  toasts = signal<Toast[] | undefined>([]);
  leaving = signal<Toast[]>([]);

  onBrowserInit() {
    const h: Handles = { timers: new Map() };
    handles.set(this, h);
    const stop = effect(() => {
      for (const t of this.toasts() ?? []) {
        if (h.timers.has(t)) continue;
        h.timers.set(t, setTimeout(() => this.expire(t), this.lifetime));
      }
    });
    h.stop = typeof stop === "function" ? stop : undefined;
  }

  onBrowserDestroy() {
    const h = handles.get(this);
    if (!h) return;
    h.stop?.();
    for (const id of h.timers.values()) clearTimeout(id);
    handles.delete(this);
  }

  /** Lifetime over: animate out, or drop at once under reduced motion. */
  expire(t: Toast) {
    if (reducedMotion()) return this.drop(t);
    this.leaving.set([...this.leaving(), t]);
  }

  /** animationend on an entry — only the exit animation removes it. */
  settle(t: Toast) {
    if (this.leaving().includes(t)) this.drop(t);
  }

  drop(t: Toast) {
    handles.get(this)?.timers.delete(t);
    this.leaving.set(this.leaving().filter((x) => x !== t));
    this.toasts.set((this.toasts() ?? []).filter((x) => x !== t));
  }
}
