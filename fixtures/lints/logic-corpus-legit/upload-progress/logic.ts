// Corpus (legit): an upload's progress bar from the browser's progress events.
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const percent = signal(0);
    const upload = (file: File) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) percent.set(Math.round(ev.loaded / ev.total * 100));
      });
      xhr.open("POST", "/api/uploads");
      xhr.send(file);
    };
    return { percent, upload };
  },
});
