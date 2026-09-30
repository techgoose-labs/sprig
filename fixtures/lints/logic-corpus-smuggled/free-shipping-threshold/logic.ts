// Corpus (smuggled): free shipping above a threshold.
import { computed, defineComponent } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["cart"],
  setup: (ctx) => {
    const cart = ctx.input<{ subtotal: number }>("cart", { subtotal: 0 });
    const shipping = computed(() => cart().subtotal >= 50 ? 0 : 4.99);
    return { shipping };
  },
});
