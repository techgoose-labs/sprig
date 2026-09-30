// Corpus (smuggled): the discount a loyalty tier earns, looked up client-side.
import { computed, defineComponent } from "@techgoose-labs/sprig";

const TIER_DISCOUNT: Record<string, number> = {
  bronze: 0.05,
  silver: 0.1,
  gold: 0.15,
  platinum: 0.2,
};

export default defineComponent({
  inputs: ["customer"],
  setup: (ctx) => {
    const customer = ctx.input<{ tier: string }>("customer", { tier: "bronze" });
    const discount = computed(() => TIER_DISCOUNT[customer().tier] ?? 0);
    const label = computed(() => `${discount() * 100}% off every order`);
    return { discount, label };
  },
});
