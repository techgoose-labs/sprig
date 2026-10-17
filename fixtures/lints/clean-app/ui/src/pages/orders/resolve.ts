// Fixture (clean): a page resolver that reads through the typed client.
import { Backend, inject } from "@techgoose-labs/sprig";
import { createClient } from "../../../../spec/contract/client/client.ts";

export const resolve = async () => {
  const api = createClient(inject(Backend));
  const orders = await api.listOrders();
  return { orders, empty: orders.length === 0 };
};
