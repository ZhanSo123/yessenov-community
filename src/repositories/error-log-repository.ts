import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class ErrorLogRepository {
  async findMany(args: Prisma.ErrorLogFindManyArgs) {
    return prisma.errorLog.findMany(args);
  }

  async findUnique(args: Prisma.ErrorLogFindUniqueArgs) {
    return prisma.errorLog.findUnique(args);
  }

  async create(args: Prisma.ErrorLogCreateArgs) {
    return prisma.errorLog.create(args);
  }

  async deleteMany(args: Prisma.ErrorLogDeleteManyArgs) {
    return prisma.errorLog.deleteMany(args);
  }

  async update(args: Prisma.ErrorLogUpdateArgs) {
    return prisma.errorLog.update(args);
  }
}
