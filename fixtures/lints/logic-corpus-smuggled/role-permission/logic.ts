// Corpus (smuggled): who may delete, decided from the user's role in the island.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type User = { id: string; role: string };

export default defineComponent({
  inputs: ["user"],
  setup: (ctx) => {
    const user = ctx.input<User>("user", { id: "", role: "viewer" });
    const deleteButton = computed(() =>
      user().role === "admin" || user().role === "owner" ? "visible" : "hidden"
    );
    return { deleteButton };
  },
});
