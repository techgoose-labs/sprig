// Fixture (clean): an island that checks required/type only and sends the
// raw values to a command; the backend validates and answers. The write lands
// in the UI first — `optimistic` applies it, then reconciles or rolls back.
import { defineComponent, optimistic, signal } from "@techgoose-labs/sprig";
import { createClient } from "../../../../../../spec/contract/client/client.ts";

export default defineComponent({
  setup: () => {
    const api = createClient(globalThis);
    const sku = signal("");
    const qty = signal("");
    const error = signal<string | null>(null);
    const page = signal(0);
    const submit = () => {
      if (!sku() || qty() === "") return error.set("required");
      optimistic(page, page() + 1, () => api.placeOrder({ sku: sku(), qty: qty() }));
    };
    return { sku, qty, error, submit };
  },
});
