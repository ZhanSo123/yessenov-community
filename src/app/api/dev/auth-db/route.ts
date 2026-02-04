import { DevAuthDbService } from "@/services/dev-auth-db-service";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const service = new DevAuthDbService();
  const summary = await service.getSummary();

  return Response.json(summary);
}
