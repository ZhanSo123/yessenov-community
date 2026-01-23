import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    username?: string | null;
    displayName?: string | null;
    hasOnboarded?: boolean;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username?: string | null;
      displayName?: string | null;
      hasOnboarded?: boolean;
      image?: string | null;
    };
  }
}
