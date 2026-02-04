import { NextRequest } from "next/server";

import { apiError } from "@/lib/api-errors";
import { requireRoleApi } from "@/lib/auth";
import { ReportStatusSchema } from "@/lib/validators";
import { AdminExportService } from "@/services/admin-export-service";

export const runtime = "nodejs";

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

    const service = new AdminExportService();
    const csv = await service.exportReports(status?.success ? status.data : null);
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
