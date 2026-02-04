import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class FeedbackRepository {
  async findMany(args: Prisma.FeedbackFindManyArgs) {
    return prisma.feedback.findMany(args);
  }

  async count(args: Prisma.FeedbackCountArgs) {
    return prisma.feedback.count(args);
  }

  async create(args: Prisma.FeedbackCreateArgs) {
    return prisma.feedback.create(args);
  }
}
