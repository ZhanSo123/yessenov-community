import { redirect } from "next/navigation";

import { auth } from "@/auth";
import ChatThread from "@/components/dm/ChatThread";
import { prisma } from "@/lib/prisma";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;

  return <ChatThread conversationId={id} />;
}
