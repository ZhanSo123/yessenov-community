"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type InviteGateProps = {
  inviteOnly: boolean;
};

export default function InviteGate({ inviteOnly }: InviteGateProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!inviteOnly) {
      return;
    }
    if (status !== "authenticated") {
      return;
    }
    if (pathname === "/welcome" || pathname === "/invite") {
      return;
    }

    const user = session?.user;
    if (!user) {
      return;
    }
    if (user.role === "MOD" || user.role === "ADMIN") {
      return;
    }
    if (!user.inviteAcceptedAt) {
      router.replace("/invite");
    }
  }, [inviteOnly, pathname, router, session, status]);

  return null;
}
