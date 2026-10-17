// Corpus (smuggled): "top customers" ordered by a value the client derives.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Customer = { name: string; orders: number; avgOrder: number };

export default defineComponent({
  inputs: ["customers"],
  setup: (ctx) => {
    const customers = ctx.input<Customer[]>("customers", []);
    const top = computed(() =>
      customers().toSorted((a, b) =>
        b.orders * b.avgOrder - a.orders * a.avgOrder
      ).slice(0, 10)
    );
    return { top };
  },
});
