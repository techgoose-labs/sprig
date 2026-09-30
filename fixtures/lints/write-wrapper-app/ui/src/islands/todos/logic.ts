// Fixture: an island that reads (GET), commands (POST) — and deletes through a
// generated DELETE wrapper, which the contract waist does not allow.
import { defineComponent, optimistic, signal } from "@techgoose-labs/sprig";
import { createClient } from "../../../../spec/contract/client/client.ts";

export default defineComponent({
  setup: () => {
    const api = createClient(globalThis);
    const items = signal<{ id: string; title: string }[]>([]);
    const load = () => api.listTodos().then((xs) => items.set(xs));
    const add = (title: string) =>
      optimistic(items, (xs) => [...xs, { id: "", title }], () => api.addTodo({ title }));
    const remove = (id: string) =>
      optimistic(items, (xs) => xs.filter((x) => x.id !== id), () => api.removeTodo({ id }));
    return { items, load, add, remove };
  },
});
