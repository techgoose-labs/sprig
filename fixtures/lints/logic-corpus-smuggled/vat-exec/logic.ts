// Corpus (smuggled): an EU VAT number parsed and checked with RegExp#exec.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

const VAT = /^(AT|BE|DE|FR|GB|IE|NL)([0-9A-Z]{8,12})$/;

export default defineComponent({
  setup: () => {
    const vat = signal("");
    const parsed = computed(() => VAT.exec(vat().replaceAll(" ", "")));
    const country = computed(() => parsed()?.[1] ?? "");
    const invalid = computed(() => vat() !== "" && !parsed());
    return { vat, country, invalid };
  },
});
