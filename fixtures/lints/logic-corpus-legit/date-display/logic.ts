// Corpus (legit): a server timestamp shown as a local date and a relative label.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Invoice = { dueAt: string; dueInDays: number };

export default defineComponent({
  inputs: ["invoice"],
  setup: (ctx) => {
    const invoice = ctx.input<Invoice>("invoice", { dueAt: "", dueInDays: 0 });
    const due = computed(() =>
      new Date(invoice().dueAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    );
    const relative = computed(() =>
      new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        invoice().dueInDays,
        "day",
      )
    );
    return { due, relative };
  },
});
