import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class LikeRepository {
  async findUnique(args: Prisma.LikeFindUniqueArgs) {
    return prisma.like.findUnique(args);
  }

  async findMany(args: Prisma.LikeFindManyArgs) {
    return prisma.like.findMany(args);
  }

  async create(args: Prisma.LikeCreateArgs) {
    return prisma.like.create(args);
  }

  async delete(args: Prisma.LikeDeleteArgs) {
    return prisma.like.delete(args);
  }

  async count(args: Prisma.LikeCountArgs) {
    return prisma.like.count(args);
  }
}
