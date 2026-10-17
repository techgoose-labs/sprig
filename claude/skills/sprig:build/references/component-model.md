# Component model — logic.ts, lifecycle, signals, DI, state

A component is a **folder**: `template.html` (the view) + optional `logic.ts`
(behavior) + optional `styles.css` (component-scoped). The folder's **basename
is its selector** — the custom tag other templates compose it with
(`components/badge/` → `<badge>`). A folder with a `logic.ts` is an **island**
(hydrates on the client); a folder with only `template.html` is **static**
(ships no JS).

## Scoped styles (`styles.css`) — and daisyUI's reserved class names

`styles.css` is view-encapsulated: each rule's key compound gets the component's
scope marker, so it can only land on this component's own elements. What
encapsulation does **not** do is shield you from **daisyUI 5, which
`sprig build` bundles into every app** (`@plugin "daisyui"`, themes off).
Tailwind emits a daisyUI component's rules — document-global, on the bare class
— the moment its class token appears in any template. So a scoped
`.stat { width: 8px }` on an element of your own still gets daisyUI's
`display: inline-grid; padding: 1rem 1.5rem; grid-template-…` on top: an 8px dot
renders as a 48×32px stat block. Same for parts and modifiers (`stat-value`,
`card-body`, `btn-sm`).

Rule: **prefix every class you style yourself** (`cm-dot`, `wb-badge`,
`<component>-part`) and never start one with a daisyUI name (`stat`, `badge`,
`status`, `list`, `card`, `label`, `link`, `toggle`, `tab`, `table`, `menu`,
`input`, `select`, `loading`, `filter`, `stack`, `footer`, `hero`, `mask`,
`diff`, `collapse`, `step`, `kbd`, `toast`, `dock`, …). `sprig build` /
`sprig dev` warn on every real collision
(`sprig: <dir>/styles.css styles .stat — daisyUI … styles the same class
name(s) globally`)
— treat the warning as red. Want the daisyUI component? Use its own name and
modifiers on purpose (`btn btn-sm`, `status status-success`) and let the tokens
style it. The complete list lives in the sprig source repo's
`docs/sprig/styling.md` (not installed with this skill); in an app, the build
warning above is the authority.

## Two ways to write `logic.ts`

**1. A class (preferred for pages + anything with lifecycle/data).** The
instance IS the template scope — its fields and methods are what `{{ }}`,
`[prop]`, and `(event)` bind to.

```ts
import { inject } from "@techgoose-labs/sprig";
import State from "../../services/state/mod.ts";

export default class Greeter {
  greeting = "(loading…)";
  state = inject(State);

  onServerInit() {
    this.greeting = "Hello from the server";
  } // server, before render
  onBrowserInit() {/* after hydration */}
  greet() {
    this.greeting = "hi";
  } // (click)="greet()"
}
```

**2. `defineComponent({ setup })`** — a function returning the reactive scope;
good for small islands built from signals.

```ts
import { defineComponent, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const count = signal(0);
    return {
      count,
      inc: () => count.set(count() + 1),
      dec: () => count.set(count() - 1),
    };
  },
});
```

Both are valid; pick the class when you want lifecycle hooks or a page's
`onServerInit` data load.

## Lifecycle hooks (class components)

All optional. Order: server render runs `onServerInit`; the client runs
`onBrowserInit` after hydration.

| Hook                 | Runs                                                      | Use for                                         |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `onServerInit()`     | server, **before** the template renders (awaited)         | load data (often `inject(Backend)`), set fields |
| `onBrowserInit()`    | client, **after** hydration                               | browser-only setup (focus, timers, listeners)   |
| `onServerDestroy()`  | server, after the render                                  | server-side cleanup                             |
| `onBrowserDestroy()` | client, when the island is torn down (e.g. soft-nav away) | clear timers/listeners                          |

**State crosses the wire.** After `onServerInit`, the instance's _serializable_
fields are snapshotted into the page HTML and **re-seeded onto the client
instance before `onBrowserInit`** — so a value set on the server is present in
the browser. Only JSON-serializable values survive (no functions/class
instances; non-finite numbers drop). `onServerInit` may be `async` (its
`await`ed data is in the snapshot).

## Signals

`signal`/`computed`/`effect`/`isSignal` from `@techgoose-labs/sprig`. A signal is
callable to read and has `.set`/`.update`:

```ts
const count = signal(0);
count(); // read → 0
count.set(2);
count.update((n) => n + 1);
const doubled = computed(() => count() * 2);
effect(() => console.log(count())); // re-runs on change
```

Templates read signals by calling them: `{{ count() }}`, `[value]="count()"`.
Reactive updates re-render the island in place.

## No business logic — the `logic-placement` lint

`sprig check` fails any island `logic.ts`, page `resolve.ts` or `template.html`
expression that decides a domain rule. Each finding names its rule letter and
line: **(a)** arithmetic on data (data × data, a member or money-named signal
× a rate literal, a `( … )` group of reads counts as data); **(b)** a
relational branch — data vs data, a member vs a threshold literal/`ALL_CAPS`
constant, the wall clock (`Date.now()`/`new Date()`) vs data, a `.length` vs
a data limit; **(c)** validation beyond required/type — `.test/.match/.exec/
.matchAll/.search(`, `RegExp`, an exact `.length`; **(d)** a validate/
compute/total/price/… function or a date-rule call (`isAfter`, `addDays`,
`differenceIn…`); **(e)** access decided in the client — `role`/`plan`/`tier`/
`permission` compared or used as a key, `can…`/`may…` set in a `switch`, a
`switch`/`if` chain on a record's `status`/`state`/`stage`/`phase` deciding data
in ≥2 branches (in a template: rendering different `(event)` actions); **(f)**
a retry loop around an awaited call. In templates a label ternary
(`m.age < 60 ? 'min ago' : …`) and `[class…]`/`[style…]`/`[attr.aria-…]`
bindings are presentation. Suppress a truly presentational line with
`// sprig-logic: <reason>` (`<!-- sprig-logic: <reason> -->` in a template).

**Known holes** (the lint lets these through — `logic-placement-corpus.int.test.ts`
pins each): composing a business identifier in a template string; equality with
a hard-coded code (`code === "SHIPFREE26"`); clamping to a limit
(`Math.min(n, MAX_PER_ORDER)`); searching/filtering loaded rows
(`.filter(… includes(q))`); a comparator without arithmetic
(`localeCompare`); a threshold on a local (`hoursLeft < 4` after clock math); a
`switch`/`if` chain on a non-lifecycle field or a bare field (`d.type`,
`@switch (status)`) — the same shape as UI dispatch. Not being flagged is not
permission: these are still queries and commands the backend answers.

## Optimistic UI (the default for every server write)

**Mandatory** (see SKILL.md): a user action that writes to the server updates
the UI _immediately_, runs the server call in the background, and rolls back
only if it fails. The component must be an **island** (it has a `logic.ts`) so
it can react on the client.

Use the primitive — `optimistic(sig, next, call, { reconcile?, onError? })` from
`@techgoose-labs/sprig`. It snapshots the signal, writes `next` synchronously
(the view repaints before the call starts), runs `call`, and on rejection
restores the snapshot. It returns `{ done, pending, error }`:

```ts
import { defineComponent, optimistic, signal } from "@techgoose-labs/sprig";

export default defineComponent({
  setup: () => {
    const items = signal<Todo[]>([]);
    const failed = signal("");
    const toggle = (id: string) =>
      optimistic(
        items,
        (xs) => xs.map((t) => t.id === id ? { ...t, done: !t.done } : t),
        () => client.toggleTodo({ id }), // a command posted as intent
        {
          reconcile: (saved, prev) =>
            prev.map((t) => t.id === saved.id ? saved : t), // server projection wins
          onError: () => failed.set("Couldn't save — reverted."),
        },
      );
    return { items, failed, toggle };
  },
});
```

Rules of thumb:

- **One call per write.** The snapshot is taken for you — roll back to it,
  don't refetch. Write new values (`{ ...t, done }`, `[...xs]`); never mutate an
  item in place, the rollback restores the old reference.
- **Don't `await` the server call before the UI changes.** Awaiting first = a
  spinner, which is the thing we're avoiding. `sprig check`'s
  **optimistic-writes** lint fails a `logic.ts` that does — including a
  loading flag set first with the real write landing after the await. Reads
  (search, load-more) may await.
- **Surface failures** — pass `onError` (toast/inline error) or render
  `w.error()`. Without either the rollback is only logged; the user sees the
  click undo itself with no reason.
- **Concurrent writes are last-write-wins** by start order: a stale failure
  never clobbers a newer write, and a rollback never lands on a value that
  failed.
- **When to wait:** only when the result is unknowable client-side
  (server-generated id, payment auth, a fetched result set). Show a
  pending/disabled state, `await`, and mark the await
  `// sprig-wait: <reason>` — the lint lists it with the reason instead of
  failing it. A spec or build-note that demands "wait for the server" is
  honored the same way.

## The serialization boundary (island state crosses as JSON)

An island's own enumerable fields are snapshotted on the server and
**JSON-round-tripped** to the client before hydration. Three measured traps:

- **Never store live handles as fields.** A DI singleton, `ctx.output()` handle,
  signal, or any class instance stored as `this.x`/a public field arrives
  client-side as a lossy plain object (`push is not a function`). Capture them
  as **constructor-local closures** used by arrow-function methods instead.
  (`#private` fields can also trip bundler brand-checks — closures are the safe
  shape.) And note: **`ctx.output()` handles are template-internal — they do not
  cross island boundaries.** For island → island (or shell ↔ page) state, wire
  it with `sets:`/`reads:`/`edits:` (see `wiring.md`), never a `state/*.ts`
  store.
- **`[value]` on `<input>`/`<textarea>` only patches the attribute.** After the
  user types, the live `.value` diverges from your signal; re-sync in
  `onBrowserInit` with an `effect()` that writes `el.value` from the signal.
- Serializable data props (strings/numbers/arrays/plain objects) are fine —
  that's the contract; anything with behavior stays out of fields.

## Dependency injection

`@Injectable` registers a class; `inject(Token)` resolves it from the active
injector.

```ts
import { Backend, inject, Injectable } from "@techgoose-labs/sprig";

@Injectable({ providedIn: "root", scope: "both" }) // scope: "both" | "server" | "client"
class Api {
  async list() {
    return inject(Backend).fetch("/things").then((r) => r.json());
  }
}

// in a component:
const api = inject(Api); // a root singleton
```

- **`inject()` is synchronous-only** — call it in a constructor, field
  initializer, `onServerInit`, or `setup`, **before any `await`**. Capture deps
  into fields first.
- **`scope`** keeps DI from crossing the SSR/client boundary: a `"server"`
  service can't be injected on the client (pass its data in as an input
  instead). `"both"` is shared.
- **`Backend`** is the in-process data client threaded in by the host
  (`backendClient`) — `inject(Backend).fetch("/path")` reads data with no TCP,
  no token, during SSR.

## StateService — persisted app state

A `StateService` subclass is a DI singleton whose serializable fields persist to
**localStorage** across navigation + full reload, restored on load.

```ts
import { Injectable, StateService } from "@techgoose-labs/sprig";

@Injectable({ providedIn: "root", scope: "both" })
export default class State extends StateService {
  static key = "app"; // STABLE key — class names are minified in prod
  count = 0;
}
```

- `inject(State)` anywhere (pages, islands). Mutate its fields; they're saved on
  navigation (`navigate`/`pagehide`) and restored when the page loads.
- `reset()` restores the constructed defaults **and** removes the saved copy
  from localStorage.
- Server-side it's just defaults (no localStorage); the client overlays the
  saved values after construction — read restored values in `onBrowserInit`, and
  use a signal field if you need the display to update reactively on restore.
- It only persists once a **client-hydrating** component constructs it (an
  island, or a page with a `logic.ts` — both hydrate). A purely static page
  never runs client code.
