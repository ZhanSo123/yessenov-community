import { toCsv } from "@/lib/csv";
import { AuditLogRepository } from "@/repositories/audit-log-repository";

export class AdminAuditExportService {
  constructor(private readonly auditRepo = new AuditLogRepository()) {}

  async exportRange(rangeMs: number) {
    const since = new Date(Date.now() - rangeMs);

    const logs = await this.auditRepo.findMany({
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

    return toCsv(headers, rows);
  }
}
