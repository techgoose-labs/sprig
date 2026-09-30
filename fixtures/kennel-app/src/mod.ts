// The whole app, three declarations. `routes` drive everything: a route's `load`
// names a page folder (template.html + optional logic.ts class for its data/behavior)
// — no per-page imports, no module map. Add a page = add a route.
import {
  bootstrap,
  defineRoutes,
  type Route,
  type SprigApp,
} from "@techgoose-labs/sprig";
import { createRenderer } from "@techgoose-labs/sprig/bedrock";
import { dirname, fromFileUrl } from "@std/path";

export const routes: Route[] = defineRoutes([
  { path: "", load: "pages/board" }, // /ui — today's board (default)
  { path: "dog/:id", load: "pages/dog-detail" }, // /ui/dog/:id
  { path: "summary", load: "pages/day-summary" }, // /ui/summary
]);

export const renderer = await createRenderer(
  dirname(fromFileUrl(import.meta.url)), // src/ root
  "/ui",
  { dev: !!Deno.env.get("SPRIG_DEV") },
);

export const sprigApp: SprigApp = bootstrap({ routes, base: "/ui", renderer });
