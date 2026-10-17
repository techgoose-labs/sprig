// Corpus (smuggled): which actions an order allows, decided from its status.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Order = { id: string; status: string };

export default defineComponent({
  inputs: ["order"],
  setup: (ctx) => {
    const order = ctx.input<Order>("order", { id: "", status: "draft" });
    const actions = computed(() => {
      let canEdit = false, canCancel = false, canRefund = false;
      switch (order().status) {
        case "draft":
          canEdit = true;
          canCancel = true;
          break;
        case "paid":
          canCancel = true;
          canRefund = true;
          break;
        case "shipped":
          canRefund = true;
          break;
      }
      return { canEdit, canCancel, canRefund };
    });
    return { actions };
  },
});
