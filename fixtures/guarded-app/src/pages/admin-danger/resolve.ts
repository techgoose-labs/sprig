// Two guards vouched for this render: requireAuth (inherited) then requireAdmin.
import { inject, type Resolve } from "@techgoose-labs/sprig";
import { Session } from "../../services/session.ts";

export const resolve: Resolve = () => ({ user: inject(Session).user });
