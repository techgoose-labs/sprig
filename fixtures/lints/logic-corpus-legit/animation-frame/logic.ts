// Corpus (legit): a drawer slide driven by requestAnimationFrame with easing.
import { defineComponent, signal } from "@techgoose-labs/sprig";

const DURATION = 220;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export default defineComponent({
  setup: () => {
    const offset = signal(-320);
    const slideIn = () => {
      const start = performance.now();
      const from = offset();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION);
        offset.set(from + (0 - from) * easeOut(t));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    return { offset, slideIn };
  },
});
