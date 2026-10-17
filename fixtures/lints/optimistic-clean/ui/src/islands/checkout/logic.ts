// A genuine wait: payment authorization is unknowable client-side.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const paying = signal(false);
    const receipt = signal("");
    const pay = async () => {
      // sprig-wait: payment auth — the receipt id only exists server-side
      const res = await fetch("/api/pay", { method: "POST" });
      receipt.set(await res.text());
    };
    return { paying, receipt, pay };
  },
});
