// The composition root for sprig's own isolate workbench app.
//
// base "" → the shell at / and component previews at /components/… (so the
// copied Playwright specs' `page.goto("/components/…")` resolve, and the stage
// iframe is same-origin with no prefix).
//
// assetsDir must be explicit: the workbench app builds into app/static, while
// deriveUiDir's entry anchor would resolve <repo>/static — which doesn't exist,
// so every /_assets/* request 404'd and preview pages rendered UNSTYLED
// (computed-style assertions in `isolate test` saw initial values, e.g.
// animationName "none").
//
//   deno serve -A --unstable-kv serve.ts
import { fromFileUrl } from "@std/path";
import { Bedrock } from "@mrg-keystone/bedrock";
import { Frontend } from "@mrg-keystone/sprig/bedrock";
import { api } from "./server/bootstrap/mod.ts"; // keep: bootstrapServer already awaited
import { app } from "./app/src/main.ts"; // sprig: bootstrap({ routes })

export default Bedrock({
  ui: Frontend({
    app,
    base: "",
    assetsDir: fromFileUrl(new URL("./app/static", import.meta.url)),
  }),
  backend: api,
});
