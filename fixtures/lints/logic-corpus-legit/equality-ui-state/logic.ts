// Corpus (legit): the selected row and tab are identity comparisons.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

type Row = { id: string; name: string };

export default defineComponent({
  inputs: ["rows"],
  setup: (ctx) => {
    const rows = ctx.input<Row[]>("rows", []);
    const selectedId = signal<string | null>(null);
    const tab = signal<"details" | "history">("details");
    const selected = computed(() => rows().find((r) => r.id === selectedId()));
    const isSelected = (r: Row) => r.id === selectedId();
    const select = (r: Row) =>
      selectedId.set(selectedId() === r.id ? null : r.id);
    const showHistory = computed(() => tab() === "history" && !!selected());
    return { tab, selected, isSelected, select, showHistory };
  },
});
