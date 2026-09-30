// REQ-061: the project's own Playwright settings — `isolate test` must apply
// its `use` block (the tile case's spec reads both values in the browser).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: { colorScheme: "dark", viewport: { width: 411, height: 600 } },
});
