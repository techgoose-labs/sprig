// Fixture (dirty): an island that prices, validates and branches on data.
import { computed, defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const subtotal = signal(0);
    const limit = signal(0);
    const coupon = signal("");
    const cart = { subtotal: 0, shipping: 0 };
    const grandTotal = computed(() => subtotal() + cart.shipping);
    const placeOrder = async () => {
      if (coupon().length < 6) return;
      if (!/^[A-Z0-9]+$/.test(coupon())) return;
      if (subtotal() > limit()) return;
      const withTax = cart.subtotal * 1.2; // sprig-logic: preview only, the command recomputes
      await fetch("/api/orders", { method: "POST", body: String(withTax) });
    };
    return { coupon, grandTotal, placeOrder };
  },
});
