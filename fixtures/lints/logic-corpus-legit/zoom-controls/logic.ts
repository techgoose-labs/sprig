// Corpus (legit): an image viewer's zoom steps.
import { defineComponent, signal } from "@techgoose-labs/sprig";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export default defineComponent({
  setup: () => {
    const zoom = signal(1);
    const zoomIn = () => zoom.set(Math.min(MAX_ZOOM, zoom() * 1.25));
    const zoomOut = () => zoom.set(Math.max(MIN_ZOOM, zoom() / 1.25));
    const percent = () => `${Math.round(zoom() * 100)}%`;
    return { zoom, zoomIn, zoomOut, percent };
  },
});
