// Corpus (smuggled): a promo code and its effect hard-coded in the island.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const code = signal("");
    const freeShipping = signal(false);
    const apply = () => {
      if (code().trim().toUpperCase() === "SHIPFREE26") freeShipping.set(true);
    };
    return { code, freeShipping, apply };
  },
});
