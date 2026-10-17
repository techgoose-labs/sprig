# Contract binding

Every unit data-need bound to an endpoint + DTO of `spec/contract/openapi.json`.

| unit      | need                | kind    | endpoint                      | dto             |
| --------- | ------------------- | ------- | ----------------------------- | --------------- |
| dashboard | list open tasks     | query   | `GET /api/tasks`              | `TaskDto[]`     |
| archive   | list open tasks     | query   | `GET /api/tasks`              | `TaskDto[]`     |
| task-row  | mark a task done    | command | `POST /api/commands/markDone` | `MarkDoneInput` |
| task-row  | reload one task     | query   | `GET /api/tasks/{id}`         | `TaskDto`       |
| stat-card | task counts         | query   | `GET /api/tasks/counts`       | `TaskCountsDto` |

## Drift

none
