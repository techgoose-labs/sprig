// Corpus (legit): a status mapped to its badge class and label — presentation.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Invoice = { status: string };

export default defineComponent({
  inputs: ["invoice"],
  setup: (ctx) => {
    const invoice = ctx.input<Invoice>("invoice", { status: "draft" });
    const badge = computed(() => {
      switch (invoice().status) {
        case "paid":
          return "badge badge-success";
        case "overdue":
          return "badge badge-error";
        default:
          return "badge badge-ghost";
      }
    });
    const label = computed(() => {
      if (invoice().status === "paid") return "Paid";
      else if (invoice().status === "overdue") return "Overdue";
      return "Draft";
    });
    return { badge, label };
  },
});
