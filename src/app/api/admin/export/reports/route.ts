import { NextRequest } from "next/server";

import { apiError } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { ReportStatusSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    await requireRoleApi("ADMIN");

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = statusParam
      ? ReportStatusSchema.safeParse(statusParam)
      : null;

    if (statusParam && !status?.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const reports = await prisma.report.findMany({
      where: status?.success ? { status: status.data } : undefined,
      orderBy: [{ createdAt: "desc" }],
      include: {
        reporter: { select: { email: true } },
        resolvedBy: { select: { email: true } },
      },
    });

    const headers = [
      "id",
      "status",
      "category",
      "severity",
      "reason",
      "postId",
      "reporterEmail",
      "createdAt",
      "resolvedAt",
      "resolvedByEmail",
    ];

    const rows = reports.map((report) => [
      report.id,
      report.status,
      report.category ?? "",
      report.severity ?? "",
      report.reason,
      report.postId,
      report.reporter.email,
      report.createdAt.toISOString(),
      report.resolvedAt ? report.resolvedAt.toISOString() : "",
      report.resolvedBy?.email ?? "",
    ]);

    const csv = toCsv(headers, rows);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=reports.csv",
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
