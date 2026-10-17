// Corpus (legit, REQ-065): accessors NAMED like a domain function that only
// read a server field through (with a seed fallback) or format it — the
// shape of fixtures/kennel-app day-stats `total()` before its rename. The
// server computed every figure; the island only shows it.
import { type ComponentCtx, signal } from "@techgoose-labs/sprig";

interface DayState {
  kennelsTotal?: number;
  revenueToday?: number | string;
  totalDogs?: number;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default class DayStats {
  kennelsTotal = signal<number>(40);
  revenueToday = signal<number | string>(1225);
  day = signal<DayState | undefined>(undefined);

  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.kennelsTotal.set(ctx.input("kennelsTotal", this.kennelsTotal())() ?? this.kennelsTotal());
  }

  /** The server's capacity, or the SSR seed until the channel carries a day. */
  total(): number {
    return this.day()?.kennelsTotal ?? this.kennelsTotal();
  }

  /** The server's revenue as USD — formatted, never computed. */
  totalRevenue(): string {
    return USD.format(Number(this.day()?.revenueToday ?? this.revenueToday()));
  }

  get totalDogs(): number | undefined {
    return this.day()?.totalDogs;
  }
}
