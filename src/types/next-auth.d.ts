import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
      role: "USER" | "MOD" | "ADMIN";
      hasOnboarded: boolean;
      age: number | null;
      bio: string | null;
      phoneE164: string | null;
      inviteAcceptedAt: string | null;
      shadowBannedAt: string | null;
      shadowBanReason: string | null;
      bannedUntil: string | null;
      banReason: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: "USER" | "MOD" | "ADMIN";
    username: string | null;
    hasOnboarded: boolean;
    age: number | null;
    bio: string | null;
    phoneE164: string | null;
    inviteAcceptedAt: Date | null;
    shadowBannedAt: Date | null;
    shadowBanReason: string | null;
    bannedUntil: Date | null;
    banReason: string | null;
  }
}
