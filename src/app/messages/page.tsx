import { redirect } from "next/navigation";

import { auth } from "@/auth";
import InboxList from "@/components/dm/InboxList";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <header>
          <h1 className="text-3xl font-semibold">Сообщения</h1>
          <p className="mt-2 text-sm text-slate-500">
            Личные диалоги в одном месте.
          </p>
        </header>
        <InboxList />
      </main>
    </div>
  );
}
