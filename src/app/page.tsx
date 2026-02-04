import { redirect } from "next/navigation";

import { auth } from "@/auth";
import HomeFeed from "@/components/HomeFeed";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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

  if (!user.username || !user.hasOnboarded) {
    redirect("/onboarding");
  }

  return <HomeFeed />;
}
