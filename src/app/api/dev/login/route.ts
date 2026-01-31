import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEV_EMAIL = "dev@local.test";
const DEV_NAME = "Dev User";
const DEV_USERNAME = "dev";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const resolveUsername = async () => {
  const candidates = [DEV_USERNAME, "dev2", "dev3", "dev4", "dev5"];
  for (const candidate of candidates) {
    const existing = await prisma.user.findUnique({
      where: { usernameLower: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  return null;
};

const ensureDevUser = async () => {
  const existing = await prisma.user.findUnique({
    where: { email: DEV_EMAIL },
  });

  if (existing) {
    return existing;
  }

  const username = await resolveUsername();

  return prisma.user.create({
    data: {
      email: DEV_EMAIL,
      name: DEV_NAME,
      username,
      usernameLower: username ? username.toLowerCase() : null,
      hasOnboarded: true,
    },
  });
};

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const user = await ensureDevUser();
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires,
    },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: false,
  });

  return response;
}
