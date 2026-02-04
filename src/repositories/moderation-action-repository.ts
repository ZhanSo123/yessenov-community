import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class ModerationActionRepository {
  async create(args: Prisma.ModerationActionCreateArgs) {
    return prisma.moderationAction.create(args);
  }

  async findMany(args: Prisma.ModerationActionFindManyArgs) {
    return prisma.moderationAction.findMany(args);
  }
}
