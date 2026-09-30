// Corpus (legit): a carousel that wraps around and autoplays.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["slides"],
  setup: (ctx) => {
    const slides = ctx.input<string[]>("slides", []);
    const current = signal(0);
    const next = () => current.set((current() + 1) % slides().length);
    const prev = () =>
      current.set((current() - 1 + slides().length) % slides().length);
    const translate = () => `translateX(-${current() * 100}%)`;
    const atEnd = () => current() >= slides().length - 1;
    return { current, next, prev, translate, atEnd };
  },
});
