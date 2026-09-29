// Corpus (smuggled): the plan's seat limit enforced before inviting.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Team = { members: string[]; maxSeats: number };

export default defineComponent({
  inputs: ["team"],
  setup: (ctx) => {
    const team = ctx.input<Team>("team", { members: [], maxSeats: 3 });
    const inviteBlocked = computed(() =>
      team().members.length >= team().maxSeats ? "Upgrade to invite more" : ""
    );
    return { inviteBlocked };
  },
});
