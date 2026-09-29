// Corpus (smuggled): which leads are "stale" is a sales rule filtered in the client.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Lead = { id: string; daysSinceContact: number; stage: string };

export default defineComponent({
  inputs: ["leads"],
  setup: (ctx) => {
    const leads = ctx.input<Lead[]>("leads", []);
    const stale = computed(() =>
      leads().filter((l) => l.stage !== "won" && l.daysSinceContact > 21)
    );
    return { stale };
  },
});
