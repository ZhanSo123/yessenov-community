import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class ReportRepository {
  async findUnique(args: Prisma.ReportFindUniqueArgs) {
    return prisma.report.findUnique(args);
  }

  async findFirst(args: Prisma.ReportFindFirstArgs) {
    return prisma.report.findFirst(args);
  }

  async findMany(args: Prisma.ReportFindManyArgs) {
    return prisma.report.findMany(args);
  }

  async create(args: Prisma.ReportCreateArgs) {
    return prisma.report.create(args);
  }

  async update(args: Prisma.ReportUpdateArgs) {
    return prisma.report.update(args);
  }

  async count(args: Prisma.ReportCountArgs) {
    return prisma.report.count(args);
  }
}
