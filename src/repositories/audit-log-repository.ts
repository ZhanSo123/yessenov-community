import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class AuditLogRepository {
  async findMany(args: Prisma.AuditLogFindManyArgs) {
    return prisma.auditLog.findMany(args);
  }

  async count(args: Prisma.AuditLogCountArgs) {
    return prisma.auditLog.count(args);
  }
}
