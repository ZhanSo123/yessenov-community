import { createAuditLog } from "@/lib/audit-log";
import { canModerate, getCommunityModeratorRole, type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportRepository } from "@/repositories/report-repository";
import { publishDomainEvent } from "@/services/event-publisher";

export type AdminReportResolveActor = { id: string; role: Role };

export type AdminReportResolveResult =
  | { ok: true; payload: { data: unknown } }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN";
      status: 404 | 403;
    };

export class AdminReportResolveService {
  constructor(private readonly reportRepo = new ReportRepository()) {}

  async resolveReport(params: {
    actor: AdminReportResolveActor;
    reportId: string;
    status: "RESOLVED" | "REJECTED";
    note?: string | null;
    request: Request;
  }): Promise<AdminReportResolveResult> {
    const { actor, reportId, status, note, request } = params;
    const action = status === "REJECTED" ? "REPORT_REJECT" : "REPORT_RESOLVE";

    const target = await this.reportRepo.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        post: { select: { communityId: true } },
      },
    });

    if (!target) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (!canModerate(actor)) {
      const communityId = target.post.communityId;
      if (!communityId) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }

      const role = await getCommunityModeratorRole(communityId, actor.id);
      if (!role) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }
    }

    const report = await prisma.$transaction(async (tx) => {
      const updated = await tx.report.update({
        where: { id: reportId },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedById: actor.id,
          resolutionNote: note ?? null,
        },
      });

      await createAuditLog(tx, request, {
        actor: { connect: { id: actor.id } },
        action,
        targetType: "Report",
        targetId: updated.id,
        metadata: { status, note: note ?? null },
      });

      return updated;
    });

    void publishDomainEvent("report.resolved", {
      reportId: report.id,
      status,
      actorId: actor.id,
    });

    return { ok: true, payload: { data: report } };
  }
}
