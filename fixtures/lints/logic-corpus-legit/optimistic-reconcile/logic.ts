// Corpus (legit): a todo added optimistically; the server's projection wins.
import { defineComponent, optimistic, signal } from "@techgoose-labs/sprig";
import { createClient } from "../../../../spec/contract/client/client.ts";

type Todo = { id: string; title: string; done: boolean };

export default defineComponent({
  inputs: ["todos"],
  setup: (ctx) => {
    const api = createClient(globalThis);
    const todos = signal<Todo[]>(ctx.input<Todo[]>("todos", [])());
    const draft = signal("");
    const add = () => {
      if (!draft()) return;
      const temp = { id: `tmp-${crypto.randomUUID()}`, title: draft(), done: false };
      optimistic(todos, (xs) => [...xs, temp], () => api.addTodo({ title: temp.title }), {
        reconcile: (saved, prev) => [...prev, saved],
      });
      draft.set("");
    };
    const remove = (id: string) =>
      optimistic(todos, (xs) => xs.filter((t) => t.id !== id), () => api.removeTodo({ id }));
    return { todos, draft, add, remove };
  },
});
