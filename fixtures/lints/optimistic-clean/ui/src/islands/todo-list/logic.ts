// Loading a list is a query: waiting on it is legitimate — when the contract
// says listTodos is a GET. Without spec/contract/openapi.json it is a write.
import { defineComponent, signal } from "@techgoose-labs/sprig";

declare const client: { listTodos(): Promise<{ id: string; title: string }[]> };

export default defineComponent({
  setup: () => {
    const loading = signal(false);
    const items = signal<{ id: string; title: string }[]>([]);
    const load = async () => {
      loading.set(true);
      const xs = await client.listTodos();
      items.set(xs);
      loading.set(false);
    };
    return { loading, items, load };
  },
});
