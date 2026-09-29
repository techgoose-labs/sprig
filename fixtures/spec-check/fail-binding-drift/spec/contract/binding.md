# Contract binding

| unit      | need                | kind    | endpoint                      | dto                 |
| --------- | ------------------- | ------- | ----------------------------- | ------------------- |
| dashboard | list open tasks     | query   | `GET /api/todos`              | `TaskDto[]`         |
| archive   | list archived tasks | query   | `GET /api/archive`            | `ArchivedTaskDto[]` |
| task-row  | mark a task done    | command | `POST /api/commands/markDone` | `MarkDoneInput`     |

## Drift

- stat-card / task counts: no counts endpoint in the contract
