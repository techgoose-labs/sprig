// Corpus (smuggled): the line total computed inside a template literal.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Line = { qty: number; unitPrice: number; currency: string };

export default defineComponent({
  inputs: ["line"],
  setup: (ctx) => {
    const line = ctx.input<Line>("line", { qty: 1, unitPrice: 0, currency: "USD" });
    const caption = computed(() =>
      `${line().qty} × ${line().unitPrice} = ${line().qty * line().unitPrice} ${line().currency}`
    );
    return { caption };
  },
});
