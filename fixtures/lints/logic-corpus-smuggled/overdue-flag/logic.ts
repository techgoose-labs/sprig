// Corpus (smuggled): "overdue" decided against the wall clock in the browser.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Invoice = { dueAt: string; paidAt: string | null };

export default defineComponent({
  inputs: ["invoice"],
  setup: (ctx) => {
    const invoice = ctx.input<Invoice>("invoice", { dueAt: "", paidAt: null });
    const overdue = computed(() =>
      !invoice().paidAt && Date.now() > Date.parse(invoice().dueAt)
    );
    return { overdue };
  },
});
