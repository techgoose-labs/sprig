// Corpus (smuggled): search over the rows loaded so far, instead of a query.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

type Product = { name: string; brand: string; discontinued: boolean };

export default defineComponent({
  inputs: ["products"],
  setup: (ctx) => {
    const products = ctx.input<Product[]>("products", []);
    const q = signal("");
    const results = computed(() =>
      products().filter((p) =>
        !p.discontinued &&
        `${p.name} ${p.brand}`.toLowerCase().includes(q().toLowerCase())
      )
    );
    return { q, results };
  },
});
