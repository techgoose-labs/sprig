import { type ComponentCtx, effect, optimistic, signal } from "@techgoose-labs/sprig";
import { createClient, type DogDto } from "../../../../../spec/contract/client/mod.ts";

/** The typed contract client over the browser's fetch (the `/api` paths are in the contract). */
const api = createClient({ fetch: globalThis.fetch.bind(globalThis) });

export type DogStatus = "booked" | "checked-in" | "walking" | "checked-out";
export type DogCommand = "dog.checkIn" | "dog.startWalk" | "dog.endWalk" | "dog.checkOut";

/** The `dog` channel payload (dog-actions `sets:dog` → dog-heading `reads:dog`). */
export interface DogChannel {
  status: DogStatus;
  overdue: boolean;
  overdueBy: string;
}

/** One `toasts` channel entry (toast-stack owns the channel; this unit `edits:toasts`). */
export interface Toast {
  kind: "error" | "success";
  msg: string;
}

/** The dog as the command's reply projects it (the server's word wins on reconcile). */
type DogReply = Partial<DogDto>;

/**
 * What the buttons render from: the status plus the server's `allowedActions`
 * (which commands this dog accepts now) and `allowedAfter` (for each allowed
 * command, what the server will accept once it lands — the optimistic intent).
 * The island decides none of it; it only draws what the dog DTO lists.
 */
interface Stance {
  status: DogStatus;
  allowedActions: string[];
  allowedAfter: Record<string, string[]>;
}

/** Each button's intent: the status its command posts (commands.json `input.status`). */
const TARGET: Record<DogCommand, DogStatus> = {
  "dog.checkIn": "checked-in",
  "dog.startWalk": "walking",
  "dog.endWalk": "checked-in",
  "dog.checkOut": "checked-out",
};
/** Each button's command, posted as intent through the contract client. */
const SEND: Record<DogCommand, (id: string) => Promise<DogReply>> = {
  "dog.checkIn": (id) => api.kennel.dogCheckIn({ id, status: "checked-in" }),
  "dog.startWalk": (id) => api.kennel.dogStartWalk({ id, status: "walking" }),
  "dog.endWalk": (id) => api.kennel.dogEndWalk({ id, status: "checked-in" }),
  "dog.checkOut": (id) => api.kennel.dogCheckOut({ id, status: "checked-out" }),
};
/** Buttons that take the primary style while they are the offered next step. */
const PRIMARY: Record<DogCommand, boolean> = {
  "dog.checkIn": true,
  "dog.startWalk": false,
  "dog.endWalk": false,
  "dog.checkOut": true,
};
/** Lower-case status wording for the rollback toast. */
const SAID: Record<DogStatus, string> = {
  "booked": "booked",
  "checked-in": "checked in",
  "walking": "walking",
  "checked-out": "checked out",
};

/** Browser-only effect disposers, kept off the instance (nothing live crosses the wire). */
const stops = new WeakMap<DogActions, () => void>();

/**
 * dog-actions — the Actions card on dog detail. Each button is an optimistic
 * status write: the card (and, through the `dog` channel, the heading badge)
 * flips to the intent at the click, the command runs behind it, and a rejected
 * command reverts and pushes an error toast onto the page's `toasts` channel.
 * Overlapping writes resolve last-write-wins by start order (`optimistic`).
 */
export default class DogActions {
  dogId = signal("d01");
  dogName = signal("Biscuit");
  closed = signal(false);
  status = signal<DogStatus>("booked");
  overdue = signal(false);
  overdueBy = signal("");
  // The input defaults below are d01's dog DTO as the server answers it (booked),
  // like the dogId/dogName/status defaults above — an unbound render shows that dog.
  /** The server's word on which commands this dog accepts now (the dog DTO's `allowedActions`). */
  allowedActions = signal<string[]>(["dog.checkIn"]);
  /** Per allowed command, what the server accepts once it lands (the dog DTO's `allowedAfter`). */
  allowedAfter = signal<Record<string, string[]>>({ "dog.checkIn": ["dog.startWalk", "dog.checkOut"] });
  /** The stance a write put on screen (intent, then the reply's); null = the inputs. */
  live = signal<Stance | null>(null);
  /** The command awaiting its reply, or null. */
  inFlight = signal<DogCommand | null>(null);
  /** `sets:dog` — the dog's status as this island shows it. */
  dog = signal<DogChannel>({ status: "booked", overdue: false, overdueBy: "" });
  /** `edits:toasts` — the page's toast queue. */
  toasts = signal<Toast[] | undefined>([]);

  /** The page's bindings reach a class island only through its ctx inputs. */
  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.dogId.set(ctx.input("dogId", this.dogId())() ?? this.dogId());
    this.dogName.set(ctx.input("dogName", this.dogName())() ?? this.dogName());
    this.closed.set(ctx.input("closed", this.closed())() ?? this.closed());
    this.status.set(ctx.input("status", this.status())() ?? this.status());
    this.overdue.set(ctx.input("overdue", this.overdue())() ?? this.overdue());
    this.overdueBy.set(ctx.input("overdueBy", this.overdueBy())() ?? this.overdueBy());
    this.allowedActions.set(ctx.input("allowedActions", this.allowedActions())() ?? this.allowedActions());
    this.allowedAfter.set(ctx.input("allowedAfter", this.allowedAfter())() ?? this.allowedAfter());
  }

  /** The stance on screen: the latest write's, else the page's inputs. */
  stance(): Stance {
    return this.live() ?? {
      status: this.status(),
      allowedActions: this.allowedActions(),
      allowedAfter: this.allowedAfter(),
    };
  }

  onBrowserInit() {
    const stop = effect(() => {
      this.dog.set({ status: this.stance().status, overdue: this.overdue(), overdueBy: this.overdueBy() });
    });
    if (typeof stop === "function") stops.set(this, stop);
  }

  onBrowserDestroy() {
    stops.get(this)?.();
    stops.delete(this);
  }

  /** Whether a button is offered now: the server lists it and the day is open. */
  offered(cmd: DogCommand): boolean {
    return !this.closed() && this.stance().allowedActions.includes(cmd);
  }

  /** Primary styling follows what the server allows, not `closed`. */
  primary(cmd: DogCommand): boolean {
    return PRIMARY[cmd] && this.stance().allowedActions.includes(cmd);
  }

  act(cmd: DogCommand) {
    if (!this.offered(cmd)) return;
    const id = this.dogId();
    const name = this.dogName();
    const target = TARGET[cmd];
    const intent: Stance = {
      status: target,
      allowedActions: this.stance().allowedAfter[cmd] ?? [],
      allowedAfter: {},
    };
    this.inFlight.set(cmd);
    const write = optimistic(this.live, intent, () => SEND[cmd](id), {
      reconcile: (reply) => {
        if (typeof reply.overdue === "boolean") this.overdue.set(reply.overdue);
        if (typeof reply.overdueBy === "string") this.overdueBy.set(reply.overdueBy);
        return {
          status: reply.status ?? intent.status,
          allowedActions: reply.allowedActions ?? intent.allowedActions,
          allowedAfter: reply.allowedAfter ?? intent.allowedAfter,
        };
      },
      onError: () => {
        const msg = `${name}: ${SAID[target]} didn't go through — reverted.`;
        this.toasts.set([...(this.toasts() ?? []), { kind: "error", msg }]);
      },
    });
    write.done.then(() => {
      if (this.inFlight() === cmd) this.inFlight.set(null);
    });
  }
}
