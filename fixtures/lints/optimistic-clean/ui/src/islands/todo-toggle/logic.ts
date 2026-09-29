// The checkbox moves on click; the server catches up; a failure rolls back.
import { defineComponent, optimistic, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  inputs: ["title"],
  setup: (ctx) => {
    const title = ctx.input<string>("title", "");
    const done = signal(false);
    const toggle = () =>
      optimistic(
        done,
        (d) => !d,
        () =>
          fetch("/api/todo/toggle", { method: "POST" }).then((r) => r.json()),
        {
          reconcile: (saved) => saved.done,
        },
      );
    return { title, done, toggle };
  },
});
