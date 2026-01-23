import { redirect } from "next/navigation";

import { auth } from "@/auth";
import HomeFeed from "@/components/HomeFeed";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
  }

  if (!session.user.username || !session.user.hasOnboarded) {
    redirect("/onboarding");
  }

  return <HomeFeed />;
}
