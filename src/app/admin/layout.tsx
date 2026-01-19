import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = session?.user?.role ?? "USER";
  const userId = session?.user?.id ?? null;
  const isGlobalMod = role === "MOD" || role === "ADMIN";
  let isCommunityMod = false;
  let isCommunityOwner = false;

  if (!userId) {
    redirect("/");
  }

  if (!isGlobalMod) {
    const mods = await prisma.communityModerator.findMany({
      where: { userId },
      select: { role: true },
    });

    isCommunityMod = mods.length > 0;
    isCommunityOwner = mods.some((mod) => mod.role === "OWNER");

    if (!isCommunityMod) {
      redirect("/");
    }
  }

  if (!isGlobalMod && !isCommunityMod) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900">
      <header className="border-b border-slate-200 bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-4 text-sm font-semibold text-slate-700">
          <Link href="/" className="text-slate-900">
            Threads
          </Link>
          <Link href="/admin" className="hover:text-slate-900">
            Dashboard
          </Link>
          <Link href="/admin/posts" className="hover:text-slate-900">
            Posts
          </Link>
          <Link href="/admin/queue" className="hover:text-slate-900">
            Queue
          </Link>
          <Link href="/admin/reports" className="hover:text-slate-900">
            Reports
          </Link>
          <Link href="/admin/appeals" className="hover:text-slate-900">
            Appeals
          </Link>
          {isGlobalMod ? (
            <Link href="/admin/users" className="hover:text-slate-900">
              Users
            </Link>
          ) : null}
          {isGlobalMod || isCommunityOwner ? (
            <Link href="/admin/communities" className="hover:text-slate-900">
              Communities
            </Link>
          ) : null}
          {isGlobalMod ? (
            <>
              <Link href="/admin/alpha" className="hover:text-slate-900">
                Alpha
              </Link>
              <Link href="/admin/metrics" className="hover:text-slate-900">
                Metrics
              </Link>
              <Link href="/admin/feedback" className="hover:text-slate-900">
                Feedback
              </Link>
              <Link href="/admin/audit" className="hover:text-slate-900">
                Audit
              </Link>
            </>
          ) : null}
          <span className="ml-auto text-xs text-slate-500">
            Role: {isGlobalMod ? role : "COMMUNITY_MOD"}
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
