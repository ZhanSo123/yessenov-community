import { auth } from "@/auth";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const session = await auth();
  const user = session?.user?.id
    ? {
        id: session.user.id,
        email: session.user.email ?? null,
      }
    : null;

  return Response.json({
    hasSession: Boolean(user),
    user,
  });
}
