// Corpus (smuggled): a per-order purchase limit enforced by clamping.
import { defineComponent, signal } from "@techgoose-labs/sprig";

const MAX_PER_ORDER = 5;

export default defineComponent({
  setup: () => {
    const qty = signal(1);
    const setQty = (n: number) => qty.set(Math.min(n, MAX_PER_ORDER));
    return { qty, setQty };
  },
});
