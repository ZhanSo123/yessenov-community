import AlphaDashboardClient from "@/app/admin/alpha/AlphaDashboardClient";

export default function AdminAlphaPage() {
  const inviteCodes =
    process.env.INVITE_CODES?.split(",").map((code) => code.trim()).filter(Boolean) ?? [];
  const inviteCode = inviteCodes[0] ?? "";
  const isDev = process.env.NODE_ENV === "development";

  return <AlphaDashboardClient inviteCode={inviteCode} isDev={isDev} />;
}
