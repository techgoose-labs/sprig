// Corpus (legit, suppressed): a live preview the command recomputes on submit.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

type Line = { qty: number; unitPrice: number };

export default defineComponent({
  inputs: ["line"],
  setup: (ctx) => {
    const line = ctx.input<Line>("line", { qty: 1, unitPrice: 0 });
    const qty = signal(line().qty);
    // sprig-logic: keystroke preview only — the placeOrder command recomputes and its answer replaces this
    const preview = computed(() => qty() * line().unitPrice);
    return { qty, preview };
  },
});
