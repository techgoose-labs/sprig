// Corpus (smuggled, REQ-065): a client state machine — which command is offered
// from which status — held in a table and compared with the record's status.
// fixtures/kennel-app dog-actions `OFFERED_FROM`: the backend should answer
// `offered: ["dog.checkIn"]` (or `canCheckIn`) with the dog.
import { type ComponentCtx, signal } from "@techgoose-labs/sprig";

type DogStatus = "booked" | "checked-in" | "walking" | "checked-out";
type DogCommand = "dog.checkIn" | "dog.startWalk" | "dog.endWalk" | "dog.checkOut";

/** The status a button is offered from. */
const OFFERED_FROM: Record<DogCommand, DogStatus> = {
  "dog.checkIn": "booked",
  "dog.startWalk": "checked-in",
  "dog.endWalk": "walking",
  "dog.checkOut": "checked-in",
};

export default class DogActions {
  closed = signal(false);
  status = signal<DogStatus>("booked");

  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.status.set(ctx.input("status", this.status())() ?? this.status());
  }

  offered(cmd: DogCommand): boolean {
    return !this.closed() && this.status() === OFFERED_FROM[cmd];
  }
}
