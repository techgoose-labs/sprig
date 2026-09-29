// Corpus (legit): aria attributes that follow the widget's own state.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["uid", "options"],
  setup: (ctx) => {
    const uid = ctx.input<string>("uid", "combo");
    const options = ctx.input<string[]>("options", []);
    const expanded = signal(false);
    const highlighted = signal(-1);
    const ariaExpanded = computed(() => String(expanded()));
    const activeDescendant = computed(() =>
      highlighted() >= 0 ? `${uid()}-opt-${highlighted()}` : undefined
    );
    const optionId = (i: number) => `${uid()}-opt-${i}`;
    const ariaSelected = (i: number) => String(i === highlighted());
    const liveText = computed(() =>
      expanded() ? `${options().length} options available` : ""
    );
    return { ariaExpanded, activeDescendant, optionId, ariaSelected, liveText };
  },
});
