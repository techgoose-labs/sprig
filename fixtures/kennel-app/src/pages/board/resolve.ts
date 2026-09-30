import { Backend, inject, type Resolve } from "@techgoose-labs/sprig";
import { createClient } from "../../../spec/contract/client/mod.ts";

/** The mock's dayLabel: `iso+"T12:00Z"` formatted en-US in UTC (never local — it shifts a day near midnight). */
const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const FILTERS = ["all", "booked", "checked-in", "walking", "checked-out"] as const;

/**
 * board data — two contract queries: `kennel.dayGet({ id: "today" })` (date,
 * closed, byStatus) and `kennel.dogList({ status })` (the server-filtered rows,
 * owner name joined). The `?status=` param is the filter; any failed read renders
 * the page's `error` state (load-error + Retry).
 */
export const resolve: Resolve = async ({ url }) => {
  const api = createClient(inject(Backend)); // synchronously, before any await
  const raw = url.searchParams.get("status") ?? "all";
  const status = FILTERS.find((f) => f === raw) ?? "all";
  try {
    const [today, dogList] = await Promise.all([
      api.kennel.dayGet({ id: "today" }),
      api.kennel.dogList({ status }),
    ]);
    return {
      loadState: "ready",
      status,
      today,
      dogList,
      dayLabel: DAY_LABEL.format(new Date(`${today.date}T12:00Z`)),
    };
  } catch {
    return { loadState: "error", status, today: null, dogList: [], dayLabel: "" };
  }
};
