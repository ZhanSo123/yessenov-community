import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class CommunityMemberRepository {
  async findMany(args: Prisma.CommunityMemberFindManyArgs) {
    return prisma.communityMember.findMany(args);
  }

  async findUnique(args: Prisma.CommunityMemberFindUniqueArgs) {
    return prisma.communityMember.findUnique(args);
  }

  async createMany(args: Prisma.CommunityMemberCreateManyArgs) {
    return prisma.communityMember.createMany(args);
  }

  async create(args: Prisma.CommunityMemberCreateArgs) {
    return prisma.communityMember.create(args);
  }

  async upsert(args: Prisma.CommunityMemberUpsertArgs) {
    return prisma.communityMember.upsert(args);
  }

  async delete(args: Prisma.CommunityMemberDeleteArgs) {
    return prisma.communityMember.delete(args);
  }
}
