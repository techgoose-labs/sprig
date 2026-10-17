// Corpus (legit): cursor pagination — the server's cursor passed straight back.
import { defineComponent, signal } from "@techgoose-labs/sprig";
import { createClient } from "../../../../spec/contract/client/client.ts";

type Page = { items: { id: string }[]; nextCursor: string | null };

export default defineComponent({
  inputs: ["first"],
  setup: (ctx) => {
    const api = createClient(globalThis);
    const first = ctx.input<Page>("first", { items: [], nextCursor: null });
    const items = signal(first().items);
    const cursor = signal(first().nextCursor);
    const loadingMore = signal(false);
    const more = async () => {
      if (!cursor() || loadingMore()) return;
      loadingMore.set(true);
      const page: Page = await api.listItems({ cursor: cursor() });
      items.set([...items(), ...page.items]);
      cursor.set(page.nextCursor);
      loadingMore.set(false);
    };
    return { items, cursor, loadingMore, more };
  },
});
