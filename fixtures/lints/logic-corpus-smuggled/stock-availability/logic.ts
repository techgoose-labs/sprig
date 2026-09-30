// Corpus (smuggled): "in stock" decided from counts the client holds.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Item = { onHand: number; reserved: number };

export default defineComponent({
  inputs: ["item", "wanted"],
  setup: (ctx) => {
    const item = ctx.input<Item>("item", { onHand: 0, reserved: 0 });
    const wanted = ctx.input<number>("wanted", 1);
    const available = computed(() =>
      item().onHand - item().reserved >= wanted() ? "In stock" : "Backorder"
    );
    return { available };
  },
});
