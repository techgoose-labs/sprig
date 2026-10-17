// Corpus (smuggled): the SKU format, validated in the island.
import { defineComponent, signal } from "@techgoose-labs/sprig";

const SKU = /^[A-Z]{3}-\d{4}-[A-Z0-9]{2}$/;

export default defineComponent({
  setup: () => {
    const sku = signal("");
    const error = signal("");
    const onSubmit = () => {
      if (!SKU.test(sku())) {
        error.set("SKU must look like ABC-1234-X9");
        return;
      }
      error.set("");
    };
    return { sku, error, onSubmit };
  },
});
