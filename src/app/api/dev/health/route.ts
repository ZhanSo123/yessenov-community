import { DevHealthService } from "@/services/dev-health-service";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const service = new DevHealthService();
  const status = await service.check();

  return Response.json(status);
}
