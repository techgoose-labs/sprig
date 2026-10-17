// Corpus (legit): scroll position sampled at most every 100 ms.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const scrolled = signal(false);
    let last = 0;
    const onScroll = () => {
      const now = performance.now();
      if (now - last < 100) return;
      last = now;
      scrolled.set(window.scrollY > 0);
    };
    return { scrolled, onScroll };
  },
});
