import { type ComponentCtx, signal } from "@techgoose-labs/sprig";

/** The `day` channel payload — the server's day (close-day-control `sets:day`). */
export interface DayState {
  closed: boolean;
  kennelsUsed?: number;
  kennelsTotal?: number;
  occupancyPct?: number;
  revenueToday?: number | string;
  overdueCount?: number;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * day-stats — the day-summary figures (occupancy, revenue, overdue pickups).
 * An island only because it follows the page's `day` channel (`reads:day`):
 * close-day-control publishes the CONFIRMED `day.close` reply and the figures
 * and the Revenue desc update in place, without a reload. Until the channel
 * carries a value it renders the SSR seed (the `today` query). Every figure is
 * the server's; the island only formats.
 */
export default class DayStats {
  kennelsUsed = signal<number>(19);
  kennelsTotal = signal<number>(40);
  occupancyPct = signal<number>(48);
  revenueToday = signal<number | string>(1225);
  overdueCount = signal<number>(2);
  closed = signal<boolean>(false);
  /** Channel field — replaced by the `reads:day` tether at hydration. */
  day = signal<DayState | undefined>(undefined);

  /** The page's bindings reach a class island only through its ctx inputs. */
  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.kennelsUsed.set(ctx.input("kennelsUsed", this.kennelsUsed())() ?? this.kennelsUsed());
    this.kennelsTotal.set(ctx.input("kennelsTotal", this.kennelsTotal())() ?? this.kennelsTotal());
    this.occupancyPct.set(ctx.input("occupancyPct", this.occupancyPct())() ?? this.occupancyPct());
    this.revenueToday.set(ctx.input("revenueToday", this.revenueToday())() ?? this.revenueToday());
    this.overdueCount.set(ctx.input("overdueCount", this.overdueCount())() ?? this.overdueCount());
    this.closed.set(ctx.input("closed", this.closed())() ?? this.closed());
  }

  used(): number {
    return this.day()?.kennelsUsed ?? this.kennelsUsed();
  }
  capacity(): number {
    return this.day()?.kennelsTotal ?? this.kennelsTotal();
  }
  pct(): number {
    return this.day()?.occupancyPct ?? this.occupancyPct();
  }
  overdue(): number {
    return this.day()?.overdueCount ?? this.overdueCount();
  }
  isClosed(): boolean {
    return this.day()?.closed ?? this.closed();
  }
  /** Formats the server's revenue as USD; never computes it. */
  revenue(): string {
    return USD.format(Number(this.day()?.revenueToday ?? this.revenueToday()));
  }
}
