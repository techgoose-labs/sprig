// Fixture: a generated typed contract client — one wrapper per endpoint.
import type { OrderDto } from "./dtos.ts";

type Transport = { fetch: typeof fetch };

export function createClient(t: Transport) {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> =>
    (await t.fetch(path, init)).json();
  return {
    listOrders: () => call<OrderDto[]>("/api/orders"),
    placeOrder: (body: { sku: string; qty: string }) =>
      call<OrderDto>("/api/orders", { method: "POST", body: JSON.stringify(body) }),
  };
}
