// Corpus (smuggled): overdue-by-more-than-a-grace-period through a date library.
import { computed, defineComponent } from "@techgoose-labs/sprig";
import { addDays, isAfter, parseISO } from "npm:date-fns@4";

type Invoice = { dueAt: string };

export default defineComponent({
  inputs: ["invoice"],
  setup: (ctx) => {
    const invoice = ctx.input<Invoice>("invoice", { dueAt: "" });
    const inCollections = computed(() =>
      isAfter(new Date(), addDays(parseISO(invoice().dueAt), 14))
    );
    return { inCollections };
  },
});
