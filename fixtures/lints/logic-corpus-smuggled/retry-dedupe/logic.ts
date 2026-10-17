// Corpus (smuggled): the client dedupes and retries a payment itself instead of
// relying on the server's idempotency.
import { defineComponent, signal } from "@techgoose-labs/sprig";
import { client } from "../../../../spec/contract/client/client.ts";

const inFlight = new Set<string>();

export default defineComponent({
  setup: () => {
    const status = signal("idle");
    const pay = async (invoiceId: string) => {
      if (inFlight.has(invoiceId)) return;
      inFlight.add(invoiceId);
      let attempt = 0;
      while (true) {
        try {
          await client.payInvoice({ invoiceId });
          status.set("paid");
          break;
        } catch {
          attempt++;
          if (attempt === 3) {
            status.set("failed");
            break;
          }
          await new Promise((r) => setTimeout(r, 2 ** attempt * 250));
        }
      }
      inFlight.delete(invoiceId);
    };
    return { status, pay };
  },
});
