// Corpus (smuggled): sales tax at a hard-coded rate on a signal read.
import { computed, defineComponent } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["subtotal"],
  setup: (ctx) => {
    const subtotal = ctx.input<number>("subtotal", 0);
    const salesTax = computed(() => subtotal() * 0.0825);
    return { salesTax };
  },
});
