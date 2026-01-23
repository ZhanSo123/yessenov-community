import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const usernameLower = username.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { usernameLower },
    select: { id: true },
  });

  if (!user) {
    notFound();
  }

  return <ProfileClient />;
}
