import type { Session } from "next-auth";

import { auth } from "@/auth";

type AuthGetter = () => Promise<Session | null>;

let override: AuthGetter | null = null;

export const setAuthOverride = (getter: AuthGetter | null) => {
  override = getter;
};

export const getAuthSession = () => (override ? override() : auth());
