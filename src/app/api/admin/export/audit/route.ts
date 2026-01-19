import { apiError } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const parseRange = (value: string | null) => {
  if (value === "24h") {
    return 24 * 60 * 60 * 1000;
  }
  if (value === "7d") {
    return 7 * 24 * 60 * 60 * 1000;
  }
  return null;
};

export async function GET(request: Request) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams.get("range"));
    if (!range) {
      return apiError("BAD_REQUEST", 400);
    }

    const since = new Date(Date.now() - range);

    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: [{ createdAt: "desc" }],
      include: {
        actor: { select: { email: true } },
      },
    });

    const headers = [
      "id",
      "actorEmail",
      "action",
      "targetType",
      "targetId",
      "createdAt",
      "ip",
      "userAgent",
      "requestId",
    ];

    const rows = logs.map((log) => [
      log.id,
      log.actor.email,
      log.action,
      log.targetType,
      log.targetId,
      log.createdAt.toISOString(),
      log.ip ?? "",
      log.userAgent ?? "",
      log.requestId ?? "",
    ]);

    const csv = toCsv(headers, rows);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=audit.csv",
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
