// Corpus (legit): toasts that dismiss themselves after a few seconds.
import { defineComponent, signal } from "@techgoose-labs/sprig";

type Toast = { id: number; text: string };

export default defineComponent({
  setup: () => {
    const toasts = signal<Toast[]>([]);
    let seq = 0;
    const show = (text: string) => {
      const id = ++seq;
      toasts.set([...toasts(), { id, text }]);
      setTimeout(() => toasts.set(toasts().filter((t) => t.id !== id)), 4000);
    };
    return { toasts, show };
  },
});
