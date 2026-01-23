import { redirect } from "next/navigation";

import { auth } from "@/auth";
import ChatThread from "@/components/dm/ChatThread";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
  }

  const { id } = await params;

  return <ChatThread conversationId={id} />;
}
