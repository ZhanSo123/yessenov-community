import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class UserIdentityKeyRepository {
  async findUnique(args: Prisma.UserIdentityKeyFindUniqueArgs) {
    return prisma.userIdentityKey.findUnique(args);
  }

  async create(args: Prisma.UserIdentityKeyCreateArgs) {
    return prisma.userIdentityKey.create(args);
  }
}
