import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class UserRepository {
  async findUnique(args: Prisma.UserFindUniqueArgs) {
    return prisma.user.findUnique(args);
  }

  async findMany(args: Prisma.UserFindManyArgs) {
    return prisma.user.findMany(args);
  }

  async findFirst(args: Prisma.UserFindFirstArgs) {
    return prisma.user.findFirst(args);
  }

  async create(args: Prisma.UserCreateArgs) {
    return prisma.user.create(args);
  }

  async update(args: Prisma.UserUpdateArgs) {
    return prisma.user.update(args);
  }

  async count(args: Prisma.UserCountArgs) {
    return prisma.user.count(args);
  }
}
