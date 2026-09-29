// Fixture (no contract): a raw fetch is allowed when there is no contract to
// enforce, and the logic lint still runs — this island is clean.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const n = signal(0);
    const bump = async () => {
      n.set(n() + 1);
      await fetch("/api/bump", { method: "POST" });
    };
    return { n, bump };
  },
});
