import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

const adapter = PrismaAdapter(prisma);
type CreateUserParams = Parameters<NonNullable<Adapter["createUser"]>>[0];
type GetUserByEmailParams = Parameters<
  NonNullable<Adapter["getUserByEmail"]>
>[0];
type LinkAccountParams = Parameters<NonNullable<Adapter["linkAccount"]>>[0];

const adapterWithLogging: Adapter = {
  ...adapter,
  async createUser(data: CreateUserParams) {
    try {
      return await adapter.createUser!(data);
    } catch (error) {
      console.error("adapter.createUser error", error);
      throw error;
    }
  },
  async getUserByEmail(email: GetUserByEmailParams) {
    try {
      return await adapter.getUserByEmail!(email);
    } catch (error) {
      console.error("adapter.getUserByEmail error", error);
      throw error;
    }
  },
  async linkAccount(data: LinkAccountParams): Promise<void> {
    try {
      await adapter.linkAccount!(data);
    } catch (error) {
      console.error("adapter.linkAccount error", error);
      throw error;
    }
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  adapter: adapterWithLogging,
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    session: ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id;
        session.user.username = user.username;
        session.user.hasOnboarded = user.hasOnboarded;
        session.user.displayName = user.displayName;
        session.user.image = user.image;
      }
      return session;
    },
  },
  debug: process.env.NODE_ENV === "development",
  logger: {
    error(error) {
      console.error("next-auth error", error);
    },
  },
  pages: {
    signIn: "/welcome",
    error: "/welcome",
  },
});
