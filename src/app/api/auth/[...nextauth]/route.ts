import { handlers } from "@/auth";
import { apiError } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const GET = handlers.GET;
export const POST = handlers.POST;
