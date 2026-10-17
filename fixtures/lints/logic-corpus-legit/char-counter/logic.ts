// Corpus (legit): a textarea's remaining-characters hint (the server enforces it).
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["maxLength"],
  setup: (ctx) => {
    const maxLength = ctx.input<number>("maxLength", 280);
    const text = signal("");
    const remaining = computed(() => maxLength() - text().length);
    const nearLimit = computed(() => remaining() < 20);
    return { text, remaining, nearLimit };
  },
});
