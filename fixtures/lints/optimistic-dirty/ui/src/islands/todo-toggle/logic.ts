// The anti-pattern: the checkbox does not move until the server answers.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["title"],
  setup: (ctx) => {
    const title = ctx.input<string>("title", "");
    const done = signal(false);
    const toggle = async () => {
      const res = await fetch("/api/todo/toggle", { method: "POST" });
      done.set((await res.json()).done);
    };
    return { title, done, toggle };
  },
});
