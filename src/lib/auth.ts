import { redirect } from "next/navigation";

import { apiError } from "@/lib/api-errors";
import { getAuthSession } from "@/lib/auth-session";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";

type RequireUserOptions = {
  mode?: "api" | "page";
  redirectTo?: string;
};

export type Role = "USER" | "MOD" | "ADMIN";

type SessionUser = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

const ROLE_ORDER: Record<Role, number> = {
  USER: 0,
  MOD: 1,
  ADMIN: 2,
};

const usernameCandidates = (base: string) => {
  const candidates = [base];
  for (let suffix = 2; suffix < 100; suffix += 1) {
    candidates.push(`${base}_${suffix}`);
  }
  candidates.push(`${base}_${Date.now().toString().slice(-6)}`);
  return candidates;
};

const createUserFromSession = async (sessionUser: SessionUser) => {
  const email = sessionUser.email?.toLowerCase() ?? "";
  try {
    return await prisma.user.create({
      data: {
        email,
        name: sessionUser.name ?? null,
        image: sessionUser.image ?? null,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      return existing;
    }

    throw apiError("INTERNAL_ERROR", 500);
  }
};

const ensureUsernameForExisting = async (
  userId: string,
  currentUsername: string | null,
  base: string
) => {
  if (currentUsername) {
    const usernameLower = currentUsername.toLowerCase();
    await prisma.user.update({
      where: { id: userId },
      data: { usernameLower },
    });
    return;
  }

  for (const candidate of usernameCandidates(base)) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          username: candidate,
          usernameLower: candidate.toLowerCase(),
        },
      });
      return;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }
};

const upsertUserFromSession = async (sessionUser: SessionUser) => {
  const email = sessionUser.email?.toLowerCase() ?? null;
  if (!email) {
    throw apiError("UNAUTHORIZED", 401);
  }

  let existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (!existing) {
    return createUserFromSession(sessionUser);
  }

  if (
    existing.username &&
    (!existing.usernameLower ||
      existing.usernameLower !== existing.username.toLowerCase())
  ) {
    await ensureUsernameForExisting(
      existing.id,
      existing.username ?? null,
      existing.username.toLowerCase()
    );
  }

  if (existing.username && !existing.hasOnboarded) {
    existing = await prisma.user.update({
      where: { id: existing.id },
      data: { hasOnboarded: true },
    });
  }

  if (
    existing.name !== sessionUser.name ||
    existing.image !== sessionUser.image
  ) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: sessionUser.name ?? existing.name,
        image: sessionUser.image ?? existing.image,
      },
    });
  }

  return existing;
};

export async function getOptionalUser() {
  const session = await getAuthSession();
  const sessionUser = session?.user ?? null;

  if (!sessionUser?.email) {
    return null;
  }

  return upsertUserFromSession(sessionUser);
}

export async function requireUserApi() {
  const session = await getAuthSession();
  const sessionUser = session?.user ?? null;

  if (!sessionUser?.email) {
    throw apiError("UNAUTHORIZED", 401);
  }

  return upsertUserFromSession(sessionUser);
}

export const canModerate = (user: { role: Role }) =>
  user.role === "MOD" || user.role === "ADMIN";

export const isAdmin = (user: { role: Role }) => user.role === "ADMIN";

export const getCommunityModeratorRole = async (
  communityId: number,
  userId: string
) => {
  const record = await prisma.communityModerator.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: { role: true },
  });

  return record?.role ?? null;
};

export const getCommunityScope = async (user: { id: string; role: Role }) => {
  if (canModerate(user)) {
    return null;
  }

  const records = await prisma.communityModerator.findMany({
    where: { userId: user.id },
    select: { communityId: true, role: true },
  });

  return records;
};

export async function requireCommunityModApi(communityId: number) {
  const user = await requireUserApi();

  if (canModerate(user)) {
    return { user, communityRole: "GLOBAL" as const };
  }

  const role = await getCommunityModeratorRole(communityId, user.id);
  if (!role) {
    throw apiError("FORBIDDEN", 403);
  }

  return { user, communityRole: role };
}

export async function requireCommunityOwnerApi(communityId: number) {
  const user = await requireUserApi();

  if (user.role === "ADMIN") {
    return { user, communityRole: "GLOBAL" as const };
  }

  const role = await getCommunityModeratorRole(communityId, user.id);
  if (role !== "OWNER") {
    throw apiError("FORBIDDEN", 403);
  }

  return { user, communityRole: role };
}

export const ensureNotBanned = (user: {
  bannedUntil: Date | null;
  banReason: string | null;
}) => {
  if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) {
    throw apiError("BANNED", 403, {
      bannedUntil: user.bannedUntil,
      banReason: user.banReason,
    });
  }
};

export const ensureOnboarded = (user: { hasOnboarded: boolean }) => {
  if (!user.hasOnboarded) {
    throw apiError("ONBOARDING_REQUIRED", 403);
  }
};

export const ensureInviteAccepted = (user: {
  inviteAcceptedAt: Date | null;
  role: Role;
}) => {
  const inviteOnly = process.env.INVITE_ONLY === "true";
  if (!inviteOnly) {
    return;
  }
  if (user.role === "MOD" || user.role === "ADMIN") {
    return;
  }
  if (!user.inviteAcceptedAt) {
    throw apiError("FORBIDDEN", 403);
  }
};

export async function requireRoleApi(minRole: "MOD" | "ADMIN") {
  const user = await requireUserApi();
  const userRole = (user.role ?? "USER") as Role;

  if (ROLE_ORDER[userRole] < ROLE_ORDER[minRole]) {
    throw apiError("FORBIDDEN", 403);
  }

  return user;
}

export async function requireUser(options: RequireUserOptions = {}) {
  const { mode = "api", redirectTo = "/" } = options;

  try {
    return await requireUserApi();
  } catch (error) {
    if (mode === "page") {
      redirect(redirectTo);
    }

    throw error instanceof Response ? error : apiError("UNAUTHORIZED", 401);
  }
}
