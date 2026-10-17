// Corpus (smuggled): the invoice number composed in the client.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Draft = { year: number; region: string; seq: number };

export default defineComponent({
  inputs: ["draft"],
  setup: (ctx) => {
    const draft = ctx.input<Draft>("draft", { year: 2026, region: "EU", seq: 0 });
    const invoiceNo = computed(() =>
      `INV-${draft().region}-${draft().year}-${String(draft().seq).padStart(6, "0")}`
    );
    return { invoiceNo };
  },
});
