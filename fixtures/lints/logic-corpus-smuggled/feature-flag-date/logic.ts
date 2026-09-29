// Corpus (smuggled): a sale that starts on a date baked into the client.
import { computed, defineComponent } from "@techgoose-labs/sprig";

const SALE_STARTS = new Date("2026-11-27T00:00:00Z");

export default defineComponent({
  setup: () => {
    const saleLive = computed(() => new Date() >= SALE_STARTS);
    return { saleLive };
  },
});
