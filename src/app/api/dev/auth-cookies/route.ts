export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const rawCookie = request.headers.get("cookie") ?? "";
    const names = rawCookie
      .split(";")
      .map((entry) => entry.trim().split("=")[0])
      .filter(Boolean);
    const sessionCookieName =
      names.find((name) => name.includes("session-token")) ?? null;

    return Response.json({
      cookies: names,
      hasSessionCookie: Boolean(sessionCookieName),
      sessionCookieName,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
