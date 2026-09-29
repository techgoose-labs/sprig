// Corpus (smuggled): a US phone number must have exactly ten digits.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const phone = signal("");
    const digits = computed(() => phone().replace(/\D/g, ""));
    const phoneOk = computed(() => digits().length === 10);
    return { phone, phoneOk };
  },
});
