// Corpus (smuggled, REQ-065): the actions an order allows, looked up by its
// status in a client table — the same rule as a status switch, as data.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";
type Order = { id: string; status: OrderStatus };

const ACTIONS: Record<OrderStatus, string[]> = {
  pending: ["pay", "cancel"],
  paid: ["ship", "refund"],
  shipped: ["return"],
  cancelled: [],
};

export default defineComponent({
  inputs: ["order"],
  setup: (ctx) => {
    const order = ctx.input<Order>("order", { id: "o1", status: "pending" });
    const actions = computed(() => ACTIONS[order().status]);
    return { actions };
  },
});
