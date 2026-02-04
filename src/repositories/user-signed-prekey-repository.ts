import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class UserSignedPreKeyRepository {
  async findFirst(args: Prisma.UserSignedPreKeyFindFirstArgs) {
    return prisma.userSignedPreKey.findFirst(args);
  }

  async upsert(args: Prisma.UserSignedPreKeyUpsertArgs) {
    return prisma.userSignedPreKey.upsert(args);
  }
}
