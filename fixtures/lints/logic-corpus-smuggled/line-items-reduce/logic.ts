// Corpus (smuggled): the order total summed over its line items.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Line = { sku: string; qty: number; unitPrice: number };

export default defineComponent({
  inputs: ["lines"],
  setup: (ctx) => {
    const lines = ctx.input<Line[]>("lines", []);
    const orderSum = computed(() =>
      lines().reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
    );
    return { orderSum };
  },
});
