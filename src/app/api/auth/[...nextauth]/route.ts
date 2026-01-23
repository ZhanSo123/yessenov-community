import { handlers } from "@/auth";
import { withApiMetrics } from "@/lib/api-metrics";

export const runtime = "nodejs";

export const GET = withApiMetrics(handlers.GET);
export const POST = withApiMetrics(handlers.POST);
