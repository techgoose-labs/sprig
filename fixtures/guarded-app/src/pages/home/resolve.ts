// Home just shows who the session says you are. Same Session service the guards
// inject — one source of truth.
import { inject, type Resolve } from "@techgoose-labs/sprig";
import { Session } from "../../services/session.ts";

export const resolve: Resolve = () => ({ user: inject(Session).user ?? "" });
