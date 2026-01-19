import { handlers } from "@/auth";
import { apiError } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { nextauth: string[] } }
) {
  if (!rateLimit(request)) {
    return apiError("TOO_MANY_REQUESTS", 429);
  }

  return handlers.GET(request, context);
}

export async function POST(
  request: Request,
  context: { params: { nextauth: string[] } }
) {
  if (!rateLimit(request)) {
    return apiError("TOO_MANY_REQUESTS", 429);
  }

  return handlers.POST(request, context);
}
