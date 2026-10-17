// Corpus (legit): a disclosure panel's open/closed state.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const open = signal(false);
    const toggle = () => open.set(!open());
    const close = () => open.set(false);
    return { open, toggle, close };
  },
});
