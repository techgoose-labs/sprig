// Corpus (smuggled): who may open an account, decided with a ternary.
import { computed, defineComponent } from "@techgoose-labs/sprig";

type Applicant = { age: number; country: string };

export default defineComponent({
  inputs: ["applicant"],
  setup: (ctx) => {
    const applicant = ctx.input<Applicant>("applicant", { age: 0, country: "" });
    const verdict = computed(() =>
      applicant().age >= 18 && applicant().country === "US"
        ? "You can open an account"
        : "Sorry, you are not eligible"
    );
    return { verdict };
  },
});
