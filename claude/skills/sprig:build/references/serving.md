# Serving & composing the app

`@techgoose-labs/sprig/bedrock` exposes the SSR renderer (`createRenderer`) and
`Frontend()` — the app's UI half, as a bedrock **`Unit`**. In dev you write none
of this: `sprig dev` composes the same thing with HMR. For production the
scaffold writes the git-root `serve.ts`.

## `Bedrock({ ui, backend, auth })` — the composition root

ONE call composes the app. The generated `serve.ts` is the whole of it:

```ts
// serve.ts — the git-root composition root; run from the git root
import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { api } from "./server/bootstrap/mod.ts"; // the keep backend: await bootstrapServer(...)

export default Bedrock({ ui: Frontend(), backend: api });
```

Every slot is optional and every subset serves:

```ts
Bedrock({ ui: Frontend(), backend: api }); // full-stack
Bedrock({ ui: Frontend() }); // frontend alone
Bedrock({ ui: Frontend(), backend: api, auth: Infra() }); // + auth
```

Dispatch (you write none of it):

- `/api/*` → the keep backend, including its docs/emulator at **`/api/docs/*`**.
  This is the channel browser **islands** use (`fetch("/api/…")`) — the only
  HTTP hop, and it is unavoidable: a browser cannot make in-process calls.
- `/auth/*` → the auth unit, when one is composed.
- `<base>/_assets/*` → the built client assets.
- everything else → the **sprig SSR app**, with the one in-process client bound
  to the `Backend` DI token. A page's `resolve.ts`/service reads data with
  `inject(Backend)` — no TCP, straight through the backend pipeline, carrying
  this request's own cookies.

The backend is `const api = await bootstrapServer("app", modules, {})`; it is
imported, **not** listened on — the composition root owns the single socket.

`Bedrock(...)` returns a callable `App` (a handler carrying `client`, `listen`,
`stop`), so the runtime's serve command, `Deno.serve(app)` and
`export default app` all work.

## Wire paths — one client, both scopes

The in-process client takes the SAME paths a browser would:

```ts
inject(Backend).get("/api/users"); // NOT "/users"
```

There is no implicit `/api` mount any more. A route-space path still works for
one release — `.get` prefixes it and logs the call site — and
`sprig migrate wire-paths` rewrites them.

## Who the caller is

`ctx.session` in a guard, and the `session` in the SSR env, are the **auth
unit's verdict for this dispatch**, stamped on the request by the composition
root and read off its envelope. sprig no longer resolves a session from a cookie
— it never could on the in-process channel — and a route's `requiredGrant` is
checked against `session.claims` by default, with no app wiring.

## Mounting inside another host

`sprigUi` is gone. To put the app under a prefix inside a host you do not
control, use `withBasePath(prefix, handler)` from `@techgoose-labs/bedrock` around
the composed `App`. Prefer composing at the root: a mount outside the root gives
that host's requests no envelope, no guard, and no client.

## The typed client — data across the waist (bridge 2)

When the backend is spec-driven (a ratified contract at the git root), the
scaffold generates a **typed client** from the rune OpenAPI
(`spec/contract/openapi.json`) into `spec/contract/client/` — via the
`contract client` CLI (`@dev-tools/contract`) — `dtos.ts` (one TS type per
DTO) + `client.ts` (one wrapper per endpoint: **queries** are reads,
**commands** are intent writes — never an edit-this-record call; the waist rule
of the sprig repo's `contract.md`). Every wrapper takes a `{ fetch }` backend,
so both channels reuse it:

- **SSR** (`resolve.ts` / services) passes `inject(Backend)` — in-process, no
  HTTP.
- **Islands** pass a plain `fetch` at `/api/*` — the one unavoidable HTTP hop.

Import the generated DTO types — no hand-typed shapes, no bare string routes.
When the backend contract changes, regenerate the client (the OpenAPI is the
source); type errors at the import sites are the drift alarm doing its job.

## The build output

`sprig build` (or `deno task build`) writes `static/`: `client.js` (the
hydration runtime), `isl.<sel>.js` (one code-split chunk per island), shared
`chunk-*.js`, scoped `app.css`, and `templates.json` (the prebuilt serialized
templates — so the runtime never parses HTML). Assets are content-hash
cache-busted via `?v=`. **Run the production path before shipping**:
`deno task build` then `deno task start`, and hit a real URL.
