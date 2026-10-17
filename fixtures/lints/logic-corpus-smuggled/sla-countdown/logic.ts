// Corpus (smuggled): a ticket is "urgent" when its SLA has under 4 hours left.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Ticket = { slaDeadline: number };

export default defineComponent({
  inputs: ["ticket"],
  setup: (ctx) => {
    const ticket = ctx.input<Ticket>("ticket", { slaDeadline: 0 });
    const urgent = computed(() => {
      const hoursLeft = (ticket().slaDeadline - Date.now()) / 3_600_000;
      return hoursLeft < 4;
    });
    return { urgent };
  },
});
