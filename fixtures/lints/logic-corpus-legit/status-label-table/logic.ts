// Corpus (legit, REQ-065): a lookup keyed by the record's status that only
// LABELS it (text and badge class) — presentation, like a badge switch.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type DogStatus = "booked" | "checked-in" | "walking" | "checked-out";
type Dog = { name: string; status: DogStatus };

const LABEL: Record<DogStatus, string> = {
  "booked": "Booked",
  "checked-in": "Checked in",
  "walking": "Out walking",
  "checked-out": "Gone home",
};
const BADGE: Record<DogStatus, string> = {
  "booked": "badge badge-ghost",
  "checked-in": "badge badge-info",
  "walking": "badge badge-accent",
  "checked-out": "badge badge-neutral",
};

export default defineComponent({
  inputs: ["dog"],
  setup: (ctx) => {
    const dog = ctx.input<Dog>("dog", { name: "Biscuit", status: "booked" });
    const label = computed(() => LABEL[dog().status]);
    const badge = computed(() => BADGE[dog().status]);
    return { label, badge };
  },
});
