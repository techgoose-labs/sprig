<sub>[← sprig docs](./README.md)</sub>

# Hosting

The app is composed by **one call**, in the git-root `serve.ts`:
`Bedrock({ ui, backend, auth })` from `@techgoose-labs/bedrock`. sprig's half is
`Frontend()` — the UI as a bedrock **`Unit`** — from
`@techgoose-labs/sprig/bedrock`.

## Composition

```ts
// serve.ts  (generated, at the git root)
import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { api } from "./server/bootstrap/mod.ts"; // the keep backend: a Unit

export default Bedrock({ ui: Frontend(), backend: api });
//   deno serve -A serve.ts   →   http://localhost:8000/ui
```

The `ui` workspace member is the SSR app; `Frontend()` resolves and mounts it
(at `base`, default `/ui`). The keep backend comes from
`server/bootstrap/mod.ts`.

Every slot is optional, and every subset serves:

```ts
Bedrock({ ui: Frontend(), backend: api }); // full-stack
Bedrock({ ui: Frontend() }); // frontend alone
Bedrock({ ui: Frontend(), backend: api, auth: Infra() }); // + auth
```

`Bedrock(...)` returns a callable `App` — a handler carrying `client`, `listen`,
`stop`, `units` — so the runtime's serve command, `Deno.serve(app)` and
`export default app` all work. It owns the single socket; the units are
imported, never listened on.

Slot namespaces default to `/` (ui), `/api` (backend) and `/auth` (auth), and
must be disjoint or composition fails loud. `Frontend({ base })` moves the SSR
pages within the ui slot.

## Dispatch table

| path               | handler                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<base>/_assets/*` | built static files from `assetsDir`, with ETag (conditional GETs 304). `cache-control` is `public, max-age=31536000, immutable` **only for content-addressed requests** — a `?v=` equal to the served dir's current content hash, or a content-hash-named `chunk-*.js`; anything else (stale/missing `?v=`) gets `no-cache` so a browser can never pin an outdated bundle across redeploys |
| `/api/*`           | the keep backend, including its docs/emulator at **`/api/docs/*`**                                                                                                                                                                                                                                                                                                                         |
| `/auth/*`          | the auth unit, when one is composed                                                                                                                                                                                                                                                                                                                                                        |
| everything else    | the sprig SSR app, with the in-process client bound to `Backend`                                                                                                                                                                                                                                                                                                                           |

Static assets answer only `GET`/`HEAD`; a real `..` path **segment** is rejected
(403), and `TRACE`/`TRACK`/`CONNECT` are **405** up front.

## The two channels

There is ONE client, and it takes the SAME paths a browser would (wire paths):

```ts
inject(Backend).get("/api/users"); // SSR, in-process — NOT "/users"
fetch("/api/users"); // an island, over the wire
```

In scope the client is **request-bound**: an SSR read carries the incoming
request's own cookies, and `Set-Cookie` from that read lands on the outer
browser response. The two channels return byte-identical observables — status,
body bytes, headers, cookies — and the parity suite gates it.

A route-space path (`"/users"`) still works for one release: `.get` prefixes
`/api` and logs the call site once. `sprig migrate wire-paths` rewrites them.

## Who the caller is

`ctx.session` in a guard, and `session` in the SSR env, are the **auth unit's
verdict for this dispatch** — read off the request envelope the composition root
stamped after `verify` allowed it. It cannot be forged: the `x-bedrock-*`
headers are stripped from every inbound request before the guard runs.

A route's `requiredGrant` is checked against `session.claims` by default, so the
ordinary case needs no `verifyGrant` wiring at all.

sprig no longer mounts an `/auth` gateway. It could not have guarded anything —
it only proxied, it sat inside the UI half, and a UI-less app had no `/auth` at
all. An auth unit owns those routes now, and its `verify` runs above every unit
on every channel.

## The request-validation gateway

Body checks (415 on a non-JSON body, 400 on a body over **4 MiB**, JSON nesting
deeper than **200**, or malformed JSON) are **keep's** now, applied by keep's
own unit. They used to live here, which meant a keep backend was only guarded
when a sprig UI happened to be composed in front of it.

## No-backend starter

`sprig init` scaffolds a `serve.ts` with no backend slot at all:

```ts
export default Bedrock({ ui: Frontend() });
```

The app runs; `inject(Backend)` fails loud with a message naming the fix, and
nothing serves `/api/*`. Add `backend: api` to get both.

## Asset versioning

The `?v=` cache-buster is the content hash of `assetsDir` (the `.js` files +
`app.css`). The ui unit computes it from the dir it **actually serves** and
threads it into the renderer via `env.assetsVersion`, so the rendered asset
URLs, the immutable check, and the served bytes can never disagree — a redeploy
changes the hash, every returning browser fetches the new bundle, and a stale
`?v=` degrades to `no-cache` revalidation instead of a year-long pin. A
standalone renderer falls back to hashing `SPRIG_ASSETS_DIR`/`<cwd>/static` and
warns once if that fails (`?v=dev`, long-term caching off).

---

**Next:** [testing.md](./testing.md) — the three test seams. **See also:**
[data-and-di.md](./data-and-di.md) · [routing.md](./routing.md)
