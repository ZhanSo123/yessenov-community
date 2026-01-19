import { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { apiError } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!rateLimit(request)) {
    return apiError("TOO_MANY_REQUESTS", 429);
  }

  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!rateLimit(request)) {
    return apiError("TOO_MANY_REQUESTS", 429);
  }

  return handlers.POST(request);
}
