/**
 * optimistic — the one primitive for a server write that must not make the UI
 * wait: the local write lands NOW, the server call runs behind it, and a
 * failure rolls back to the right value and says so.
 *
 * ```ts
 * const w = optimistic(todos, (xs) => [...xs, draft], () => api.add(draft), {
 *   reconcile: (saved, prev) => [...prev, saved], // server projection wins
 * });
 * w.pending(); w.error(); await w.done;
 * ```
 *
 * Ordering is LAST-WRITE-WINS by start order, per signal. Each signal keeps its
 * last confirmed value and the writes still in flight:
 *  • a write that fails while a NEWER write is in flight changes nothing on
 *    screen (the newer write stands);
 *  • the newest write failing rolls back to the next-newest write still in
 *    flight, else to the last confirmed value — never to a value that failed;
 *  • a write that succeeds becomes the confirmed value (its `reconcile` result
 *    when given) and supersedes every OLDER write still in flight; it repaints
 *    only if no newer write is on screen.
 */
import { type Accessor, signal } from "./core.ts";

/** Anything signal-shaped: called to read, `.set(v)` to write. The framework's
 *  `WritableAccessor<T>` is one; so is a hand-rolled store cell. */
export interface SignalLike<T> {
  (): T;
  set(v: T): void;
}

export interface OptimisticOptions<T, R> {
  /** On success, replace the optimistic value with the server's projection.
   *  `prev` is the value the signal held before this write. */
  reconcile?: (result: R, prev: T) => T;
  /** On failure, after the rollback. Without it the error is logged with
   *  `console.error` — a rollback is never silent. */
  onError?: (err: unknown, prev: T) => void;
}

export interface OptimisticWrite<R> {
  /** Settles when the call does: the result, or `undefined` after a rollback. */
  done: Promise<R | undefined>;
  /** True from the moment the call starts until it settles. */
  pending: Accessor<boolean>;
  /** The call's rejection, `undefined` until (and unless) it fails. */
  error: Accessor<unknown>;
}

interface Ledger<T> {
  confirmed: T;
  inFlight: { value: T }[];
}

const ledgers = new WeakMap<object, Ledger<unknown>>();

export function optimistic<T, R>(
  sig: SignalLike<T>,
  next: T | ((prev: T) => T),
  call: () => Promise<R>,
  opts: OptimisticOptions<T, R> = {},
): OptimisticWrite<R> {
  const prev = sig();
  const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;

  let ledger = ledgers.get(sig) as Ledger<T> | undefined;
  if (!ledger || ledger.inFlight.length === 0) {
    ledger = { confirmed: prev, inFlight: [] };
    ledgers.set(sig, ledger as Ledger<unknown>);
  }
  const book = ledger;
  const entry = { value };
  book.inFlight.push(entry);
  sig.set(value);

  const pending = signal(true);
  const error = signal<unknown>(undefined);

  let started: Promise<R>;
  try {
    started = call();
  } catch (e) {
    started = Promise.reject(e);
  }

  const done = Promise.resolve(started).then(
    (result) => {
      const final = opts.reconcile ? opts.reconcile(result, prev) : value;
      const at = book.inFlight.indexOf(entry);
      if (at >= 0) {
        const newest = at === book.inFlight.length - 1;
        book.confirmed = final;
        book.inFlight.splice(0, at + 1);
        if (newest) sig.set(final);
      }
      pending.set(false);
      return result;
    },
    (err) => {
      const at = book.inFlight.indexOf(entry);
      if (at >= 0) {
        if (at === book.inFlight.length - 1) {
          sig.set(at > 0 ? book.inFlight[at - 1].value : book.confirmed);
        }
        book.inFlight.splice(at, 1);
      }
      error.set(err);
      pending.set(false);
      if (opts.onError) opts.onError(err, prev);
      else {
        console.error(
          "sprig optimistic(): the server call failed and the write was rolled back —" +
            " pass onError to surface it in the UI",
          err,
        );
      }
      return undefined;
    },
  );

  return { done, pending, error };
}
