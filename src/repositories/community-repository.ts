import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class CommunityRepository {
  async findUnique(args: Prisma.CommunityFindUniqueArgs) {
    return prisma.community.findUnique(args);
  }

  async findMany(args: Prisma.CommunityFindManyArgs) {
    return prisma.community.findMany(args);
  }

  async create(args: Prisma.CommunityCreateArgs) {
    return prisma.community.create(args);
  }
}
