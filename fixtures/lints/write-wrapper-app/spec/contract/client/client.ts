// Fixture: the shape `contract client` generates — one wrapper per openapi
// operation, EVERY method included (it does not filter PUT/PATCH/DELETE).
import type { AddTodoInput, TodoDto } from "./dtos.ts";

type Backend = { fetch: typeof fetch };

export function createClient(backend: Backend) {
  const req = async <T>(
    method: string,
    path: string,
    init: { body?: unknown } = {},
  ): Promise<T> =>
    (await backend.fetch(path, {
      method,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })).json();
  return {
    listTodos: () => req<TodoDto[]>("GET", "/api/todos"),
    addTodo: (input: AddTodoInput) =>
      req<TodoDto>("POST", "/api/todos", { body: input }),
    removeTodo: (input: { id: string }) =>
      req<void>("DELETE", `/api/todos/${input.id}`),
  };
}
