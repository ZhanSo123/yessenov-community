import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import bcrypt from "bcrypt";
import { z } from "zod";

import { checkActivityLimit } from "@/lib/abuse-tracker";
import { getClientIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const rawNextAuthSecret = process.env.NEXTAUTH_SECRET ?? "";
const looksLikeCommand = rawNextAuthSecret.includes("openssl rand -base64 32");
const isProd = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
const resolvedNextAuthUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
const trustHost = process.env.AUTH_TRUST_HOST === "true" || isVercel;

if (!process.env.NEXTAUTH_URL && resolvedNextAuthUrl) {
  process.env.NEXTAUTH_URL = resolvedNextAuthUrl;
}

if (!isProd) {
  if (!rawNextAuthSecret || looksLikeCommand) {
    console.warn(
      "NEXTAUTH_SECRET is missing or looks like a command. Set a real secret string in .env.local."
    );
  }
  console.debug("Auth config", {
    trustHost,
    resolvedNextAuthUrl: process.env.NEXTAUTH_URL ?? null,
    useSecureCookies: isProd,
  });
}

const ensureUserProfile = async (
  userId: string,
  name?: string | null,
  image?: string | null
) => {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, usernameLower: true, name: true, image: true },
  });

  if (!existing) {
    return;
  }

  const updates: {
    usernameLower?: string;
    name?: string | null;
    image?: string | null;
  } = {};

  if (existing.username) {
    const usernameLower = existing.username.toLowerCase();
    if (existing.usernameLower !== usernameLower) {
      updates.usernameLower = usernameLower;
    }
  }

  if (name && existing.name !== name) {
    updates.name = name;
  }

  if (image && existing.image !== image) {
    updates.image = image;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: updates,
    });
  }
};

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

const credentialsSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(8).max(72),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        identifier: { label: "Email or username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const identifier = parsed.data.identifier.trim().toLowerCase();
        const ip = request ? getClientIp(request) : "unknown";
        const rate = checkActivityLimit(`auth:login:${ip}`, 60_000, 10);
        if (!rate.allowed) {
          throw new Error("RATE_LIMIT");
        }

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: { equals: identifier, mode: "insensitive" } },
              { usernameLower: identifier },
            ],
          },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );

        if (!valid) {
          return null;
        }

        return user;
      },
    }),
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          }),
        ]
      : []),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "database" },
  useSecureCookies: isProd,
  trustHost,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.username = user.username ?? null;
        session.user.role = user.role;
        session.user.hasOnboarded = user.hasOnboarded ?? false;
        session.user.age = user.age ?? null;
        session.user.bio = user.bio ?? null;
        session.user.phoneE164 = user.phoneE164 ?? null;
        session.user.inviteAcceptedAt = user.inviteAcceptedAt ?? null;
        session.user.shadowBannedAt = user.shadowBannedAt ?? null;
        session.user.shadowBanReason = user.shadowBanReason ?? null;
        session.user.bannedUntil = user.bannedUntil ?? null;
        session.user.banReason = user.banReason ?? null;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
  },
  events: {
    async createUser({ user }) {
      if (user?.id) {
        await ensureUserProfile(user.id, user.name, user.image);
      }
    },
    async signIn({ user }) {
      if (user?.id) {
        await ensureUserProfile(user.id, user.name, user.image);
      }
    },
  },
  pages: {
    signIn: "/welcome",
    error: "/welcome",
  },
});
