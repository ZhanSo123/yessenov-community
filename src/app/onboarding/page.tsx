import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import OnboardingClient from "./OnboardingClient";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      hasOnboarded: true,
      inviteAcceptedAt: true,
      role: true,
    },
  });

  if (!user) {
    redirect("/welcome");
  }

  const inviteOnly = process.env.INVITE_ONLY === "true";
  if (
    inviteOnly &&
    user.role !== "MOD" &&
    user.role !== "ADMIN" &&
    !user.inviteAcceptedAt
  ) {
    redirect("/invite");
  }

  if (user.hasOnboarded) {
    redirect("/");
  }

  return <OnboardingClient />;
}
