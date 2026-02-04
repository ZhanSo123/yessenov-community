import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { defaultLocale, isLocale, localeCookieKey } from "@/lib/i18n/config";

const parseAcceptLanguage = (value: string | null) => {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim().split(";")[0])
    .map((part) => part.split("-")[0])
    .filter(Boolean);
};

export const proxy = (request: NextRequest) => {
  const cookieValue = request.cookies.get(localeCookieKey)?.value ?? "";
  if (cookieValue && isLocale(cookieValue)) {
    return NextResponse.next();
  }

  const accepted = parseAcceptLanguage(request.headers.get("accept-language"));
  const preferred =
    accepted.find((lang) => isLocale(lang)) ?? defaultLocale;

  const response = NextResponse.next();
  response.cookies.set(localeCookieKey, preferred, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  return response;
};

export const config = {
  matcher: ["/((?!_next/|favicon.ico|assets/).*)"],
};
