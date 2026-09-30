// Corpus (smuggled): money rounded to cents in the browser.
import { computed, defineComponent } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["subtotal"],
  setup: (ctx) => {
    const subtotal = ctx.input<number>("subtotal", 0);
    const rounded = computed(() => Math.round(subtotal() * 100) / 100);
    return { rounded };
  },
});
