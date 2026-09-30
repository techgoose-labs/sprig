import { type ComponentCtx, signal } from "@techgoose-labs/sprig";

export type DogStatus = "booked" | "checked-in" | "walking" | "checked-out";

/** The `dog` channel payload (set by dog-actions, read here). */
export interface DogState {
  status: DogStatus;
  overdue: boolean;
  overdueBy?: string;
}

/**
 * dog-heading — the dog's name as the page h1 plus its status / overdue badges.
 * An island only because it follows the page's `dog` channel (`reads:dog`):
 * dog-actions flips it optimistically, reconciles or rolls it back, and the
 * heading re-renders in place. Until the channel carries a value it renders
 * the SSR seed (`status`, `overdue`, `overdueBy` from the page's dogDetail).
 */
export default class DogHeading {
  name = signal<string>("");
  status = signal<DogStatus>("booked");
  overdue = signal<boolean>(false);
  overdueBy = signal<string>("");
  /** Channel field — replaced by the `reads:dog` tether at hydration. */
  dog = signal<DogState | undefined>(undefined);

  /** The page's bindings reach a class island only through its ctx inputs. */
  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.name.set(ctx.input("name", this.name())() ?? this.name());
    this.status.set(ctx.input("status", this.status())() ?? this.status());
    this.overdue.set(ctx.input("overdue", this.overdue())() ?? this.overdue());
    this.overdueBy.set(ctx.input("overdueBy", this.overdueBy())() ?? this.overdueBy());
  }

  /** What the badges show: the channel once it has a value, else the SSR seed. */
  current(): DogState {
    return this.dog() ?? {
      status: this.status(),
      overdue: this.overdue(),
      overdueBy: this.overdueBy(),
    };
  }
}
