import { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { apiError } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> }
) {
  if (!rateLimit(request)) {
    return apiError("TOO_MANY_REQUESTS", 429);
  }

  const resolvedParams = await params;
  return handlers.GET(request, { params: resolvedParams });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> }
) {
  if (!rateLimit(request)) {
    return apiError("TOO_MANY_REQUESTS", 429);
  }

  const resolvedParams = await params;
  return handlers.POST(request, { params: resolvedParams });
}
