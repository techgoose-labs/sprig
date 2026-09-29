# Data model (pre-contract) — Kennel board

No ratified contract exists (no `spec/contract/openapi.json`, no
`spec/runes/*.rune`), so this is the pre-contract fallback. Ground truth is the
two-seam prototype: `spec/ui/kennel-prototype/objects/*.json` (the read model)
and `commands.json` (the write contract). **Schema only — no data rows.**
`binding.md` replaces the endpoint column once the contract lands.

## Entities

### dog — `objects/dog.json` (32 at load)

| field | type | values / notes |
| --- | --- | --- |
| `id` | string | `d01`… |
| `name` | string | free text; up to ~40 chars in seed (overflow case: "Sir Reginald Barksworth-Fluffington III") |
| `breed` | string | free text |
| `owner` | string → owner.id | many dogs : one owner (owners appear on 1–2 dogs) |
| `kennel` | string | kennel code `K01`… (unique per dog at load) |
| `status` | enum | `booked` \| `checked-in` \| `walking` \| `checked-out` (display order: that order) |
| `arrival` | string `HH:MM` | display-only time of day |
| `overdue` | boolean | **server-decided** (the UI never does date math) |
| `overdueBy` | string? | human duration (`"2h 15m"`), present only when `overdue` |
| `notes` | note[] | child collection, 0–3 at load; append-only via `dog.addNote` |

### note — child of dog (`dog.notes[]`)

| field | type | values / notes |
| --- | --- | --- |
| `id` | string | server id (`n_…`); client temp id `pending` while unsent |
| `text` | string | free text, long (overflow case: a ~200-char note) |
| `author` | string | free text (`Front desk`, `Walker: …`, `Vet tech`) |
| `at` | string ISO local `YYYY-MM-DDTHH:MM` | server timestamp, rendered as UTC `Mon D, h:mm AM` |

### owner — `objects/owner.json` (20 at load)

| field | type | notes |
| --- | --- | --- |
| `id` | string | `o01`… |
| `name` | string | shown on dog card, detail, overdue list; fallback `Unknown owner` when missing |
| `phone` | string | display-only formatted string |

### stay — `objects/stay.json` (32 at load, one per dog)

| field | type | notes |
| --- | --- | --- |
| `id` | string | `s01`… |
| `dog` | string → dog.id | one stay : one dog (0 or 1 per dog — "No stay on file" when absent) |
| `checkIn` | string ISO local | |
| `plannedCheckOut` | string ISO local | |
| `nightlyRate` | number (USD) | rendered `Intl` currency |
| `nights` | integer | |
| `totalDue` | number (USD) | **server figure** — never computed in the UI |

### day — `objects/day.json` (1 at load, id `today`)

| field | type | notes |
| --- | --- | --- |
| `id` | string | `today` |
| `date` | string `YYYY-MM-DD` | rendered `Weekday, Month D` |
| `kennelsTotal` | integer | |
| `kennelsUsed` | integer | |
| `occupancyPct` | integer 0–100 | server-computed |
| `revenueToday` | number (USD) | server-computed; final once `closed` |
| `byStatus` | `{ booked, checked-in, walking, checked-out: integer }` | server-computed per-status counts |
| `overdueCount` | integer | server-computed |
| `closed` | boolean | locks every stay action when true |

**Generation:** hand-authored deterministic seed (sequential ids, rotating
breeds/status/rates, owners reused round-robin). Two dogs are overdue; one dog
has 3 notes, one has 1; the rest have none (honest-empty for notes).

## Reads (queries) — the unit holds params, never filters/sorts rows itself

| need | shape consumed | params | pre-contract path (proposal) |
| --- | --- | --- | --- |
| `today` | day: `date, closed, byStatus, kennelsTotal, kennelsUsed, occupancyPct, revenueToday, overdueCount` | — | `GET /api/days/today` |
| `dogList` | dog[]: `id, name, breed, kennel, status, arrival, overdue, overdueBy` **+ `ownerName`** | `status` (`all` or one enum value) | `GET /api/dogs?status=<s>` |
| `dogDetail` | dog (all fields incl. `notes[]`) + owner `name, phone` + stay (or null) | `id` | `GET /api/dogs/{id}` |
| `overduePickups` | dog[]: `id, name, kennel, overdue, overdueBy` + owner `name, phone` | `overdue=true` | `GET /api/dogs?overdue=true` |

## Writes (commands) — from `commands.json`

| need | command | kind | input | feedback | pre-contract `METHOD /path` (the case `_network` key) |
| --- | --- | --- | --- | --- | --- |
| `checkIn` | `dog.checkIn` | set | `{ id, status: "checked-in" }` | instant | `POST /api/dogs/{id}/check-in` |
| `startWalk` | `dog.startWalk` | set | `{ id, status: "walking" }` | instant | `POST /api/dogs/{id}/start-walk` |
| `endWalk` | `dog.endWalk` | set | `{ id, status: "checked-in" }` | instant | `POST /api/dogs/{id}/end-walk` |
| `checkOut` | `dog.checkOut` | set | `{ id, status: "checked-out" }` | instant | `POST /api/dogs/{id}/check-out` |
| `addNote` | `dog.addNote` | append (`notes`) | `{ id, text, author }` → reply: note | instant | `POST /api/dogs/{id}/notes` |
| `closeDay` | `day.close` | set | `{ id, closed: true }` → reply: day | **confirmed** | `POST /api/days/{id}/close` |

Every status command's reply is the updated dog (reconciles `status`, and for
`checkOut` the `overdue` flag). The server recomputes `day.byStatus`,
`occupancyPct`, and (on check-out) `revenueToday` — the UI never tallies.

## Reverse index (unit → needs)

| unit | needs |
| --- | --- |
| `board` (page) | `today`, `dogList` |
| `status-strip` | `today` (`byStatus`) |
| `dog-grid` | `dogList` |
| `dog-card` | `dogList` (one row) |
| `dog-detail` (page) | `dogDetail`, `today` (`closed`) |
| `dog-heading` | `dogDetail` (`name, status, overdue, overdueBy`) |
| `dog-profile-card` | `dogDetail` (`breed, kennel, arrival`, owner `name, phone`) |
| `stay-card` | `dogDetail` (stay) |
| `dog-actions` | `dogDetail` (`id, name, status`), `today` (`closed`), `checkIn`, `startWalk`, `endWalk`, `checkOut` |
| `dog-notes` | `dogDetail` (`id, name, notes`), `addNote` |
| `day-summary` (page) | `today`, `overduePickups` |
| `close-day-control` | `today` (`id, closed`), `closeDay` |
| `day-closed-alert` | `today` (`closed`) |
| `day-stats` | `today` (`kennelsUsed, kennelsTotal, occupancyPct, revenueToday, overdueCount, closed`) |
| `status-breakdown` | `today` (`byStatus, kennelsTotal`) |
| `overdue-pickups` | `overduePickups` |

## Data-shape hazards

1. **Owner join on the client.** The mock resolves `owner(d.owner)` by scanning
   the whole owner collection for every card / overdue row. The build must get
   owner `name` (and `phone` where shown) **in the query's DTO**
   (`dogList.ownerName`, `dogDetail.owner`, `overduePickups.owner`), never load
   all owners and join.
2. **Global aggregates.** `day.byStatus`, `occupancyPct`, `revenueToday`,
   `overdueCount`, `kennelsUsed` are server rollups across all dogs/stays; every
   status command changes them. They must come from the `today` query, never be
   counted from `dogList` (the mock's own comment: "the UI never tallies them").
3. **Client-side filter.** The board's status filter and the summary's overdue
   list are `Array.filter` in the mock; in the build they are **query params**
   (`?status=`, `?overdue=true`).
4. **Cross-entity rollup on write.** `dog.checkOut` moves the stay total into
   today's revenue and clears `overdue`; after a status write, the board's
   strip counts are stale until the next `today` read (request-response — no
   push channel in the mock).
5. **Stay lookup by dog.** The mock finds the stay by scanning `stay.dog`; the
   build reads it as part of `dogDetail`.
6. **Honest-empty:** `dogList` empty (no dogs today) vs empty-for-filter are
   distinct states; notes empty; stay absent; overdue list empty.
