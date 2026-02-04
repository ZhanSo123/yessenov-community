import { toCsv } from "@/lib/csv";
import { ReportRepository } from "@/repositories/report-repository";

export class AdminExportService {
  constructor(private readonly reportRepo = new ReportRepository()) {}

  async exportReports(status?: string | null) {
    const reports = await this.reportRepo.findMany({
      where: status ? { status: status as "OPEN" | "RESOLVED" | "REJECTED" } : undefined,
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

    return toCsv(headers, rows);
  }
}
