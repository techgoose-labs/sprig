import { type ComponentCtx, signal } from "@techgoose-labs/sprig";
import { createClient } from "../../../../../spec/contract/client/mod.ts";

/** The typed contract client over the browser's fetch (the `/api` paths are in the contract). */
const api = createClient({ fetch: globalThis.fetch.bind(globalThis) });

/** The `day` channel payload — the server's day (close-day-control `sets:day`). */
export interface Day {
  id: string;
  closed: boolean;
  kennelsUsed?: number;
  kennelsTotal?: number;
  occupancyPct?: number;
  revenueToday?: number;
  overdueCount?: number;
}

/** One `toasts` channel entry (toast-stack owns the channel; this unit `edits:toasts`). */
export interface Toast {
  kind: "error" | "success";
  msg: string;
}

/**
 * close-day-control — the day-summary header's "Close the day" control. A
 * CONFIRMED write (not optimistic): the button goes pending, the reply decides,
 * and only then does the badge replace it and the server's day go out on the
 * `day` channel. A refusal changes nothing but pushes an error toast.
 */
export default class CloseDayControl {
  dayId = signal("today");
  closed = signal(false);
  pending = signal(false);
  /** `sets:day` — the day as the server last described it (seeded by the page's SSR `today`). */
  day = signal<Day>({ id: "today", closed: false });
  /** `edits:toasts` — the page's toast queue. */
  toasts = signal<Toast[] | undefined>([]);

  /** The page's bindings reach a class island only through its ctx inputs. */
  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.dayId.set(ctx.input("dayId", this.dayId())() ?? this.dayId());
    this.closed.set(ctx.input("closed", this.closed())() ?? this.closed());
    this.day.set(ctx.input("day", this.day())() ?? this.day());
  }

  async close() {
    if (this.pending() || this.closed()) return;
    const id = this.dayId();
    this.pending.set(true);
    try {
      // sprig-wait: day.close — the lock and final revenue are decided server-side and the close can be refused (dogs still walking)
      const reply = await api.kennel.dayClose({ id, closed: true });
      const next: Day = { ...this.day(), ...reply, id, closed: reply.closed ?? true };
      this.day.set(next);
      this.closed.set(next.closed);
      this.push({ kind: "success", msg: "Day closed — ledger locked." });
      queueMicrotask(() => document.getElementById("day-closed-badge")?.focus());
    } catch {
      this.push({ kind: "error", msg: "The day couldn't be closed — nothing changed." });
    } finally {
      this.pending.set(false);
    }
  }

  private push(t: Toast) {
    this.toasts.set([...(this.toasts() ?? []), t]);
  }
}
