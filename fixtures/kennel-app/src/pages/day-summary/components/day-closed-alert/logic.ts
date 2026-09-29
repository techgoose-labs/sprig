import { type ComponentCtx, signal } from "@techgoose-labs/sprig";

/** The `day` channel payload — the server's day (close-day-control `sets:day`). */
export interface DayState {
  closed: boolean;
  kennelsUsed?: number;
  kennelsTotal?: number;
  occupancyPct?: number;
  revenueToday?: string;
  overdueCount?: number;
}

/**
 * day-closed-alert — the "Today's ledger is locked" success alert on
 * day-summary. An island only because it follows the page's `day` channel
 * (`reads:day`): close-day-control publishes the CONFIRMED `day.close` reply
 * and the alert appears in place, without a reload. Until the channel carries
 * a value it renders the SSR seed `closed` (today.closed). Open day → nothing.
 */
export default class DayClosedAlert {
  /** SSR seed: today.closed. */
  closed = signal<boolean>(false);
  /** Channel field — replaced by the `reads:day` tether at hydration. */
  day = signal<DayState | undefined>(undefined);
  /** Whether the alert was already showing when the island hydrated. */
  shownAtHydration = true;

  /** The page's bindings reach a class island only through its ctx inputs. */
  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.closed.set(ctx.input("closed", this.closed())() ?? this.closed());
  }

  /** The channel once it has a value, else the SSR seed. */
  shown(): boolean {
    return this.day()?.closed ?? this.closed();
  }

  /** The entrance runs only on a client-side open → closed flip, never on first paint. */
  entering(): boolean {
    return !this.shownAtHydration && this.shown();
  }

  onBrowserInit(): void {
    this.shownAtHydration = this.shown();
  }
}
