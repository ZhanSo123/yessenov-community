import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class PostRepository {
  async findUnique(args: Prisma.PostFindUniqueArgs) {
    return prisma.post.findUnique(args);
  }

  async findFirst(args: Prisma.PostFindFirstArgs) {
    return prisma.post.findFirst(args);
  }

  async findMany(args: Prisma.PostFindManyArgs) {
    return prisma.post.findMany(args);
  }

  async create(args: Prisma.PostCreateArgs) {
    return prisma.post.create(args);
  }

  async count(args: Prisma.PostCountArgs) {
    return prisma.post.count(args);
  }

  async update(args: Prisma.PostUpdateArgs) {
    return prisma.post.update(args);
  }
}
