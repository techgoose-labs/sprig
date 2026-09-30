// Corpus (smuggled): currency conversion against a rate table.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["amount", "rates"],
  setup: (ctx) => {
    const amount = ctx.input<number>("amount", 0);
    const rates = ctx.input<Record<string, number>>("rates", {});
    const currency = signal("EUR");
    const converted = computed(() => amount() * rates()[currency()]);
    return { currency, converted };
  },
});
