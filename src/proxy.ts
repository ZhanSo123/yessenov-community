import { NextResponse, type NextRequest } from "next/server";

import { apiError } from "@/lib/api-errors";

export default function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(
    request.cookies.get("authjs.session-token") ||
      request.cookies.get("__Host-authjs.session-token") ||
      request.cookies.get("__Secure-authjs.session-token") ||
      request.cookies.get("next-auth.session-token") ||
      request.cookies.get("__Host-next-auth.session-token") ||
      request.cookies.get("__Secure-next-auth.session-token")
  );
  const isLoggedIn = hasSessionCookie;
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/api") && !pathname.startsWith("/api/auth")) {
    if (pathname === "/api/feed" && request.method === "GET") {
      const mode = searchParams.get("mode") ?? "for-you";
      if (mode === "following" && !isLoggedIn) {
        return apiError("UNAUTHORIZED", 401);
      }

      return NextResponse.next();
    }

    if (request.method === "POST" && !isLoggedIn) {
      return apiError("UNAUTHORIZED", 401);
    }
  }

  if (pathname === "/onboarding" && !isLoggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/create" || pathname.startsWith("/settings")) {
    if (!isLoggedIn) {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/create", "/onboarding", "/settings/:path*", "/api/:path*"],
};
