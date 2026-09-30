import { type ComponentCtx, effect, optimistic, signal } from "@techgoose-labs/sprig";
import { createClient } from "../../../../../spec/contract/client/mod.ts";

/** The typed contract client over the browser's fetch (the `/api` paths are in the contract). */
const api = createClient({ fetch: globalThis.fetch.bind(globalThis) });

/** One handling note as the server returns it; `pending` marks the local intent. */
export interface Note {
  id?: string;
  text: string;
  author: string;
  at?: string;
  pending?: boolean;
}

/** A toast on the page's `toasts` channel (toast-stack renders it). */
export interface Toast {
  kind: "error" | "success";
  msg: string;
}

/** Input-sync effect disposers, kept off the instance (fields cross the SSR wire). */
const stops = new WeakMap<object, () => void>();

const stampFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * dog-notes — the dog's handling notes plus the append form. Appends the note
 * at once (dimmed, "saving…"), posts it in the background, swaps in the
 * server's note on success, and on failure removes it, puts the text back in
 * the box and raises an error toast on the page's `toasts` channel.
 */
export default class DogNotes {
  dogId = "d01";
  dogName = "Biscuit";
  notes = signal<Note[]>([]);
  draft = signal("");
  author = signal("Front desk");
  /** `edits:toasts` — adopted from the page's toast-stack at hydration. */
  toasts = signal<Toast[] | undefined>(undefined);

  /** The page's bindings reach a class island only through its ctx inputs. */
  constructor(ctx?: ComponentCtx) {
    if (!ctx) return;
    this.dogId = ctx.input("dogId", this.dogId)() ?? this.dogId;
    this.dogName = ctx.input("dogName", this.dogName)() ?? this.dogName;
    this.notes.set(ctx.input("notes", this.notes())() ?? this.notes());
  }

  onBrowserInit() {
    stops.get(this)?.();
    // `[value]` only patches the attribute; keep the live inputs in step with
    // the signals (a rollback restores `draft` into the box).
    const root = document.querySelector('sprig-island[data-sel="dog-notes"]');
    const text = root?.querySelector<HTMLInputElement>('input[name="text"]');
    const who = root?.querySelector<HTMLInputElement>('input[name="author"]');
    const offDraft = effect(() => {
      const v = this.draft();
      if (text && text.value !== v) text.value = v;
    });
    const offAuthor = effect(() => {
      const v = this.author();
      if (who && who.value !== v) who.value = v;
    });
    stops.set(this, () => {
      offDraft();
      offAuthor();
    });
  }

  onBrowserDestroy() {
    stops.get(this)?.();
    stops.delete(this);
  }

  /** The meta line's second half: saving… / the note's time / just now. */
  stamp(note: Note): string {
    if (note.pending) return "saving…";
    return note.at ? stampFormat.format(new Date(note.at + "Z")) : "just now";
  }

  add() {
    const text = this.draft().trim();
    const author = this.author().trim();
    if (!text) return;
    const intent: Note = { id: "pending", text, author, pending: true };
    this.draft.set("");
    optimistic(
      this.notes,
      (xs) => [...xs, intent],
      () => api.kennel.dogAddNote({ id: this.dogId, text, author }),
      {
        // `prev` is the pre-write snapshot — swap the reply into the CURRENT list
        // so a note added meanwhile is kept.
        reconcile: (saved) =>
          this.notes().map((n) => n === intent ? { ...saved, pending: false } : n),
        onError: () => {
          this.draft.set(text);
          const toast: Toast = {
            kind: "error",
            msg: `Note for ${this.dogName} wasn't saved — it's back in the box.`,
          };
          this.toasts.set([...(this.toasts() ?? []), toast]);
        },
      },
    );
  }
}
