import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class FollowRepository {
  async findUnique(args: Prisma.FollowFindUniqueArgs) {
    return prisma.follow.findUnique(args);
  }

  async findMany(args: Prisma.FollowFindManyArgs) {
    return prisma.follow.findMany(args);
  }

  async count(args: Prisma.FollowCountArgs) {
    return prisma.follow.count(args);
  }

  async create(args: Prisma.FollowCreateArgs) {
    return prisma.follow.create(args);
  }

  async delete(args: Prisma.FollowDeleteArgs) {
    return prisma.follow.delete(args);
  }
}
