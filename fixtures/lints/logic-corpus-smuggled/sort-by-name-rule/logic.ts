// Corpus (smuggled): VIPs first, then alphabetical — a ranking rule in a comparator.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Account = { name: string; vip: boolean };

export default defineComponent({
  inputs: ["accounts"],
  setup: (ctx) => {
    const accounts = ctx.input<Account[]>("accounts", []);
    const ordered = computed(() =>
      accounts().toSorted((a, b) =>
        Number(b.vip) - Number(a.vip) || a.name.localeCompare(b.name)
      )
    );
    return { ordered };
  },
});
