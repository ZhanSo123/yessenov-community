export default function AdminIndexPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <p className="text-sm text-slate-600">
          Быстрые ссылки на основные разделы модерации.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        {[
          { href: "/admin/users", label: "Users" },
          { href: "/admin/posts", label: "Posts" },
          { href: "/admin/queue", label: "Queue" },
          { href: "/admin/reports", label: "Reports" },
          { href: "/admin/appeals", label: "Appeals" },
          { href: "/admin/communities", label: "Communities" },
          { href: "/admin/metrics", label: "Metrics" },
          { href: "/admin/feedback", label: "Feedback" },
          { href: "/admin/audit", label: "Audit" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="bubble-btn rounded-full px-4 py-2 text-xs font-semibold pressable"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
