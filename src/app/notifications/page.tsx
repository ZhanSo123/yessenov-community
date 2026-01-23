import { redirect } from "next/navigation";

import { auth } from "@/auth";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/welcome");
  }

  return <NotificationsClient />;
}
