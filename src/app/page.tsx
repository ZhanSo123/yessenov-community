import { redirect } from "next/navigation";

import HomeFeed from "@/components/HomeFeed";
import { getOptionalUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getOptionalUser();

  if (!user) {
    redirect("/welcome");
  }

  const inviteOnly = process.env.INVITE_ONLY === "true";
  if (
    inviteOnly &&
    !user.inviteAcceptedAt &&
    user.role !== "MOD" &&
    user.role !== "ADMIN"
  ) {
    redirect("/invite");
  }

  if (!user.username) {
    redirect("/onboarding");
  }

  return <HomeFeed />;
}
