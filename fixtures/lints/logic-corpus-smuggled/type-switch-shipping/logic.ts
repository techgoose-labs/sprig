// Corpus (smuggled): the shipping fee per delivery type, switched in the island.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Order = { delivery: { type: string } };

export default defineComponent({
  inputs: ["order"],
  setup: (ctx) => {
    const order = ctx.input<Order>("order", { delivery: { type: "standard" } });
    const shipping = computed(() => {
      switch (order().delivery.type) {
        case "express":
          return 15;
        case "overnight":
          return 30;
        default:
          return 5;
      }
    });
    return { shipping };
  },
});
