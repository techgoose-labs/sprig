// Corpus (legit): roving focus through a listbox with the arrow keys.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["options"],
  setup: (ctx) => {
    const options = ctx.input<{ id: string; label: string }[]>("options", []);
    const active = signal(0);
    const onKeydown = (e: KeyboardEvent) => {
      const n = options().length;
      if (n === 0) return;
      if (e.key === "ArrowDown") active.set((active() + 1) % n);
      else if (e.key === "ArrowUp") active.set((active() - 1 + n) % n);
      else if (e.key === "Home") active.set(0);
      else if (e.key === "End") active.set(n - 1);
      else return;
      e.preventDefault();
      document.getElementById(options()[active()].id)?.focus();
    };
    return { active, onKeydown };
  },
});
