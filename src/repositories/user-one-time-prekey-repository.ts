import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class UserOneTimePreKeyRepository {
  async findFirst(args: Prisma.UserOneTimePreKeyFindFirstArgs) {
    return prisma.userOneTimePreKey.findFirst(args);
  }

  async createMany(args: Prisma.UserOneTimePreKeyCreateManyArgs) {
    return prisma.userOneTimePreKey.createMany(args);
  }

  async update(args: Prisma.UserOneTimePreKeyUpdateArgs) {
    return prisma.userOneTimePreKey.update(args);
  }
}
