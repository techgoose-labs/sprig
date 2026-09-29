// Corpus (legit): a fetch's loading / error / empty states and a retry button.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";
import { createClient } from "../../../../spec/contract/client/client.ts";

export default defineComponent({
  setup: () => {
    const api = createClient(globalThis);
    const status = signal<"idle" | "loading" | "error" | "ready">("idle");
    const rows = signal<{ id: string }[]>([]);
    const error = signal<string | null>(null);
    const load = async () => {
      status.set("loading");
      try {
        rows.set(await api.listOrders({}));
        status.set("ready");
      } catch (err) {
        error.set(String(err));
        status.set("error");
      }
    };
    const empty = computed(() => status() === "ready" && rows().length === 0);
    const onRetry = () => load();
    return { status, rows, error, empty, load, onRetry };
  },
});
