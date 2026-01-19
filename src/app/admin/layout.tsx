import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          <Link href="/admin/users" className="hover:text-slate-900">
            Users
          </Link>
          <Link href="/admin/communities" className="hover:text-slate-900">
            Communities
          </Link>
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
