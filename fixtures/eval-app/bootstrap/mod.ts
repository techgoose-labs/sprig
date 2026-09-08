// Your keep backend (jsr:@techgoose-labs/rune). It is a bedrock UNIT; serve.ts composes it:
// the in-process client is bound to the Backend DI token for SSR, and the network
// handler serves /api/* (token-gated) + /docs. It is imported, never listened on —
// `deno serve serve.ts` owns the socket. Add endpoints by generating rune modules
// (or hand-writing Danet controllers) and listing them in the array below.
import "reflect-metadata";
import { bootstrapServer } from "@techgoose-labs/rune";

export const api = await bootstrapServer("eval-app", [], {});
