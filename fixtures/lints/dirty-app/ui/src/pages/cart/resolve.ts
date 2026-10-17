// Fixture (dirty): a resolver that reaches the backend around the contract
// and derives a total on the client.
import { Backend, inject } from "@techgoose-labs/sprig";

export const resolve = async () => {
  const be = inject(Backend);
  const res = await be.get<{ price: number; qty: number }[]>("/api/cart");
  const lines = res.data ?? [];
  let sum = 0;
  for (const line of lines) sum += line.price * line.qty;
  return { lines, sum };
};
