// Corpus (smuggled): an invoice's due date from its payment terms.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Invoice = { issuedAt: string; termsDays: number };

export default defineComponent({
  inputs: ["invoice"],
  setup: (ctx) => {
    const invoice = ctx.input<Invoice>("invoice", { issuedAt: "", termsDays: 30 });
    const dueDate = computed(() => {
      const due = new Date(invoice().issuedAt);
      due.setDate(due.getDate() + invoice().termsDays);
      return due.toLocaleDateString();
    });
    return { dueDate };
  },
});
