import { Backend, inject, type Resolve } from "@techgoose-labs/sprig";
import { createClient } from "../../../spec/contract/client/mod.ts";

/** The mock's dayLabel: `iso+"T12:00Z"` formatted en-US in UTC (never local — it shifts a day near midnight). */
const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * day-summary data — two contract queries: `kennel.dayGet({ id: "today" })` (the
 * day with its server rollups) and `kennel.dogList({ overdue: true })` (the
 * server-filtered overdue rows, owner joined). Any failed read renders the page's
 * `error` state (load-error + Retry).
 */
export const resolve: Resolve = async () => {
  const api = createClient(inject(Backend)); // synchronously, before any await
  try {
    const [today, overduePickups] = await Promise.all([
      api.kennel.dayGet({ id: "today" }),
      api.kennel.dogList({ overdue: true }),
    ]);
    return {
      state: "live",
      today,
      overduePickups,
      dayLabel: DAY_LABEL.format(new Date(`${today.date}T12:00Z`)),
    };
  } catch {
    return { state: "error", today: null, overduePickups: [], dayLabel: "" };
  }
};
