// Corpus (smuggled, REQ-065): a regex on a URL the USER typed is validation —
// the route exemption covers the current location, not form input.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const website = signal("");
    const error = signal("");
    const onBlur = () => {
      error.set(/^https?:\/\/[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(website()) ? "" : "Enter a valid URL");
    };
    return { website, error, onBlur };
  },
});
