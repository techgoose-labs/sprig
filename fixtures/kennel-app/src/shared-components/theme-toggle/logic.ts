import { defineComponent, effect, signal } from "@techgoose-labs/sprig";

type Theme = "brand" | "brand-dark";

/** Flips `html[data-theme]` between the light `brand` and `brand-dark` themes. */
export default defineComponent({
  setup: () => {
    const theme = signal<Theme>("brand");
    const doc = globalThis.document;
    if (doc) {
      // The shell owns the initial theme: seed from what the page already renders.
      if (doc.documentElement.dataset.theme === "brand-dark") theme.set("brand-dark");
      effect(() => {
        doc.documentElement.dataset.theme = theme();
      });
    }
    const toggle = () => theme.set(theme() === "brand-dark" ? "brand" : "brand-dark");
    return { theme, toggle };
  },
});
