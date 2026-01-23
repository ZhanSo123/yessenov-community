import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import FollowListClient from "../FollowListClient";

export default async function FollowersPage({
  params,
}: {
  params: { username: string };
}) {
  const usernameLower = params.username.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { usernameLower },
    select: { username: true },
  });

  if (!user) {
    notFound();
  }

  return (
    <FollowListClient
      username={user.username ?? params.username}
      mode="followers"
    />
  );
}
