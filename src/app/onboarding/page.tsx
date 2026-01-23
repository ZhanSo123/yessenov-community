import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import OnboardingClient from "./OnboardingClient";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, hasOnboarded: true },
  });

  if (!user) {
    redirect("/welcome");
  }

  if (user.hasOnboarded) {
    redirect("/");
  }

  return <OnboardingClient />;
}
