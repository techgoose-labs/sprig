// Corpus (legit): a virtualized list — only the rows in view are rendered.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

const ROW_HEIGHT = 36;
const OVERSCAN = 4;

export default defineComponent({
  inputs: ["rows"],
  setup: (ctx) => {
    const rows = ctx.input<{ id: string }[]>("rows", []);
    const scrollTop = signal(0);
    const viewportHeight = signal(600);
    const firstIndex = computed(() =>
      Math.max(0, Math.floor(scrollTop() / ROW_HEIGHT) - OVERSCAN)
    );
    const visibleCount = computed(() =>
      Math.ceil(viewportHeight() / ROW_HEIGHT) + OVERSCAN * 2
    );
    const windowed = computed(() =>
      rows().slice(firstIndex(), firstIndex() + visibleCount()).map((r, i) => ({
        ...r,
        top: (firstIndex() + i) * ROW_HEIGHT,
      }))
    );
    const totalHeight = computed(() => rows().length * ROW_HEIGHT);
    const onScroll = (e: Event) =>
      scrollTop.set((e.target as HTMLElement).scrollTop);
    return { windowed, totalHeight, onScroll, viewportHeight };
  },
});
