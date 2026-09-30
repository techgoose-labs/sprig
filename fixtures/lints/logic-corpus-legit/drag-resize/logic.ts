// Corpus (legit): a panel resized by dragging its handle.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const height = signal(280);
    const onPointerDown = (e: PointerEvent) => {
      const startY = e.clientY;
      const startH = height();
      const move = (m: PointerEvent) =>
        height.set(Math.max(120, startH + (startY - m.clientY)));
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    return { height, onPointerDown };
  },
});
