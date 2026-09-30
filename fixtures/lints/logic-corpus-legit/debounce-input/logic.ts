// Corpus (legit): a search box that waits for the typing to settle.
import { defineComponent, signal } from "@techgoose-labs/sprig";

const DEBOUNCE_MS = 250;

export default defineComponent({
  setup: () => {
    const draft = signal("");
    const query = signal("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = (ev: Event) => {
      draft.set((ev.target as HTMLInputElement).value);
      clearTimeout(timer);
      timer = setTimeout(() => query.set(draft().trim()), DEBOUNCE_MS);
    };
    return { draft, query, onInput };
  },
});
