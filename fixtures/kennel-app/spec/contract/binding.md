# Contract binding — Kennel board

Every data-need in `spec/ui/breakdown/inventory.json` bound to the ratified
contract `spec/contract/openapi.json` (derived from the prototype's two seams:
`objects/<type>.json` → queries, `commands.json` → commands, each command
carrying its seam verb as `x-sprig-command`). Reads bind to **query** endpoints
(GET), writes to **command** verbs (POST); `dto` names the query's response
schema or the command's request schema in `spec/contract/client/dtos.ts`.
Filters (`status`, `overdue`) are query params the server applies — never
client logic. `today` is the day read by id `today`. Schema only — no rows.

| unit | need | kind | endpoint | dto |
| --- | --- | --- | --- | --- |
| board | today | query | `GET /api/day/{id}` | DayDto |
| board | dogList | query | `GET /api/dog?status=<s>` | DogDto[] |
| status-strip | today | query | `GET /api/day/{id}` | DayDto |
| dog-grid | dogList | query | `GET /api/dog?status=<s>` | DogDto[] |
| dog-card | dogList | query | `GET /api/dog?status=<s>` | DogDto[] |
| dog-detail | dogDetail | query | `GET /api/dog/{id}` | DogDto |
| dog-detail | today | query | `GET /api/day/{id}` | DayDto |
| dog-heading | dogDetail | query | `GET /api/dog/{id}` | DogDto |
| dog-profile-card | dogDetail | query | `GET /api/dog/{id}` | DogDto |
| stay-card | dogDetail | query | `GET /api/dog/{id}` | DogDto |
| dog-actions | dogDetail | query | `GET /api/dog/{id}` | DogDto |
| dog-actions | today | query | `GET /api/day/{id}` | DayDto |
| dog-actions | checkIn | command | `POST /api/dog/check-in` | DogCheckInDto |
| dog-actions | startWalk | command | `POST /api/dog/start-walk` | DogStartWalkDto |
| dog-actions | endWalk | command | `POST /api/dog/end-walk` | DogEndWalkDto |
| dog-actions | checkOut | command | `POST /api/dog/check-out` | DogCheckOutDto |
| dog-notes | dogDetail | query | `GET /api/dog/{id}` | DogDto |
| dog-notes | addNote | command | `POST /api/dog/add-note` | DogAddNoteDto |
| day-summary | today | query | `GET /api/day/{id}` | DayDto |
| day-summary | overduePickups | query | `GET /api/dog?overdue=true` | DogDto[] |
| close-day-control | today | query | `GET /api/day/{id}` | DayDto |
| close-day-control | closeDay | command | `POST /api/day/close` | DayCloseDto |
| day-closed-alert | today | query | `GET /api/day/{id}` | DayDto |
| day-stats | today | query | `GET /api/day/{id}` | DayDto |
| status-breakdown | today | query | `GET /api/day/{id}` | DayDto |
| overdue-pickups | overduePickups | query | `GET /api/dog?overdue=true` | DogDto[] |

## Drift

none
