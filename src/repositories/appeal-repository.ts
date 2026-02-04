import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class AppealRepository {
  async findUnique(args: Prisma.AppealFindUniqueArgs) {
    return prisma.appeal.findUnique(args);
  }

  async findFirst(args: Prisma.AppealFindFirstArgs) {
    return prisma.appeal.findFirst(args);
  }

  async findMany(args: Prisma.AppealFindManyArgs) {
    return prisma.appeal.findMany(args);
  }

  async create(args: Prisma.AppealCreateArgs) {
    return prisma.appeal.create(args);
  }

  async update(args: Prisma.AppealUpdateArgs) {
    return prisma.appeal.update(args);
  }
}
