// Corpus (smuggled): the actions an invoice offers, listed per status.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Invoice = { id: string; status: string };

export default defineComponent({
  inputs: ["invoice"],
  setup: (ctx) => {
    const invoice = ctx.input<Invoice>("invoice", { id: "", status: "draft" });
    const actions = computed(() => {
      switch (invoice().status) {
        case "draft":
          return ["send", "delete"];
        case "sent":
          return ["remind", "void"];
        case "overdue":
          return ["remind", "collections"];
        default:
          return [];
      }
    });
    return { actions };
  },
});
