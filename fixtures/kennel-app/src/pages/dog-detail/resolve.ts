import {
  Backend,
  currentInjector,
  inject,
  type Resolve,
  setResponseStatus,
} from "@techgoose-labs/sprig";
import { ContractError, createClient } from "../../../spec/contract/client/mod.ts";

/** The stay as stay-card renders it (display strings, formatted server-side). */
interface StayView {
  checkIn: string;
  plannedCheckOut: string;
  nightlyRate: string;
  nights: number;
  totalDue: string;
}

// The mock's `when()`: ISO-local strings shown as UTC "Mon D, h:mm AM" (timezone-neutral).
const when = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const stamp = (iso: string) => when.format(new Date(`${iso}Z`));

/**
 * dog-detail — two contract queries (`kennel.dogGet` by `params.id`, today's
 * `closed` via `kennel.dayGet`), shaped for display. The statuses map to states,
 * nothing more: the dog read answering 404 while the backend answers the day read
 * is an unknown dog (the not-found card); any other failure — a 404 on both reads
 * (no backend / no route mounted), a server error, the network — is the `error`
 * state (load-error + Retry).
 */
export const resolve: Resolve = async ({ params }) => {
  const api = createClient(inject(Backend));
  const inj = currentInjector(); // capture BEFORE any await
  const [dogRead, dayRead] = await Promise.allSettled([
    api.kennel.dogGet({ id: params.id }),
    api.kennel.dayGet({ id: "today" }),
  ]);
  if (dayRead.status === "fulfilled" && dogRead.status === "fulfilled") {
    const detail = dogRead.value;
    const stay: StayView | null = detail.stay
      ? {
        checkIn: stamp(detail.stay.checkIn),
        plannedCheckOut: stamp(detail.stay.plannedCheckOut),
        nightlyRate: usd.format(detail.stay.nightlyRate),
        nights: detail.stay.nights,
        totalDue: usd.format(detail.stay.totalDue),
      }
      : null;
    return { state: "live", dog: { ...detail, stay }, closed: dayRead.value.closed };
  }
  const unknownDog = dayRead.status === "fulfilled" &&
    dogRead.status === "rejected" &&
    dogRead.reason instanceof ContractError && dogRead.reason.status === 404;
  if (unknownDog) {
    if (inj) setResponseStatus(inj, 404);
    return { state: "not-found", dog: null, closed: false };
  }
  return { state: "error", dog: null, closed: false };
};
