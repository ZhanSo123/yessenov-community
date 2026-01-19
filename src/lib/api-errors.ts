import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "NOT_FOUND"
  | "BANNED"
  | "ONBOARDING_REQUIRED"
  | "RATE_LIMIT"
  | "INTERNAL_ERROR"
  | "TOO_MANY_REQUESTS";

const isDev = process.env.NODE_ENV === "development";

const withRequestId = <T extends Record<string, unknown>>(payload: T) =>
  isDev ? { ...payload, requestId: crypto.randomUUID() } : payload;

export const apiError = (
  code: ApiErrorCode,
  status: number,
  extras?: Record<string, unknown>
) =>
  NextResponse.json(
    withRequestId({ error: code, ...(extras ?? {}) }),
    { status }
  );

export const apiSuccess = (
  payload: Record<string, unknown>,
  init?: ResponseInit
) => NextResponse.json(withRequestId(payload), init);
