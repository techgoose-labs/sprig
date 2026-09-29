// saver — an optimistic write: the count moves on click, the POST runs after,
// and a failed POST rolls the count back. The case's _network decides the POST.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const count = signal(0);
    const status = signal("idle");
    const save = async () => {
      count.set(count() + 1);
      status.set("pending");
      try {
        const res = await fetch("/api/save", { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        status.set("saved");
      } catch {
        count.set(count() - 1);
        status.set("rolled back");
      }
    };
    return { count, status, save };
  },
});
