import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <header className="border-b border-[color:var(--border)] bg-[color:var(--surface)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-4 text-sm font-semibold text-[color:var(--foreground)]">
          <Link href="/" className="text-slate-900">
            Threads
          </Link>
          <Link
            href="/admin"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/posts"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Posts
          </Link>
          <Link
            href="/admin/queue"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Queue
          </Link>
          <Link
            href="/admin/reports"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Reports
          </Link>
          <Link
            href="/admin/appeals"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Appeals
          </Link>
          <Link
            href="/admin/users"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Users
          </Link>
          <Link
            href="/admin/communities"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Communities
          </Link>
          <Link
            href="/admin/alpha"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Alpha
          </Link>
          <Link
            href="/admin/metrics"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Metrics
          </Link>
          <Link
            href="/admin/feedback"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Feedback
          </Link>
          <Link
            href="/admin/audit"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Audit
          </Link>
          <Link
            href="/admin/errors"
            className="bubble-btn rounded-full px-3 py-1 text-xs font-semibold pressable"
          >
            Errors
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
