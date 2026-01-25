export default function AdminIndexPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Admin Panel</h1>
      <ul>
        <li><a href="/admin/users">Users</a></li>
        <li><a href="/admin/posts">Posts</a></li>
        <li><a href="/admin/reports">Reports</a></li>
        <li><a href="/admin/metrics">Metrics</a></li>
      </ul>
    </div>
  );
}