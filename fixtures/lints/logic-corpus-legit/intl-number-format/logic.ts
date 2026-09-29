// Corpus (legit): the server's amount, formatted for the reader's locale.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Quote = { totalCents: number; currency: string };

export default defineComponent({
  inputs: ["quote"],
  setup: (ctx) => {
    const quote = ctx.input<Quote>("quote", { totalCents: 0, currency: "USD" });
    const fmt = computed(() =>
      new Intl.NumberFormat(navigator.language, {
        style: "currency",
        currency: quote().currency,
      })
    );
    const shown = computed(() => fmt().format(quote().totalCents / 100));
    return { shown };
  },
});
