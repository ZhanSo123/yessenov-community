import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ProfileSettingsClient from "./ProfileSettingsClient";

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      displayName: true,
      bio: true,
      image: true,
      faculty: true,
      course: true,
      interests: true,
      hasOnboarded: true,
      inviteAcceptedAt: true,
      role: true,
    },
  });

  if (!user) {
    redirect("/welcome");
  }

  const inviteOnly = process.env.INVITE_ONLY === "true";
  if (
    inviteOnly &&
    user.role !== "MOD" &&
    user.role !== "ADMIN" &&
    !user.inviteAcceptedAt
  ) {
    redirect("/invite");
  }

  if (!user.hasOnboarded || !user.username) {
    redirect("/onboarding");
  }

  return (
    <ProfileSettingsClient
      initialUsername={user.username}
      initialDisplayName={user.displayName ?? ""}
      initialBio={user.bio ?? ""}
      initialImage={user.image ?? ""}
      initialFaculty={user.faculty ?? ""}
      initialCourse={user.course ? String(user.course) : ""}
      initialInterests={(user.interests ?? []).join(", ")}
    />
  );
}
