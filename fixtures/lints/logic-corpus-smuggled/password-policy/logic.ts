// Corpus (smuggled): the password policy, enforced in the browser.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const pw = signal("");
    const weak = signal(false);
    const onSubmit = () => {
      weak.set(pw().length < 12 || !/[A-Z]/.test(pw()) || !/\d/.test(pw()));
    };
    return { pw, weak, onSubmit };
  },
});
