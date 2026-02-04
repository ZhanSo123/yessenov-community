import { redirect } from "next/navigation";

import { auth } from "@/auth";
import InboxList from "@/components/dm/InboxList";
import { getServerTranslator } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";

export default async function MessagesPage() {
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

  const { t } = await getServerTranslator();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header>
          <h1 className="text-3xl font-semibold">{t("messages.title")}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("messages.subtitle")}
          </p>
        </header>
        <InboxList />
      </main>
    </div>
  );
}
