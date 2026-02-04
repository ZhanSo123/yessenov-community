import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class MessageRepository {
  async findMany(args: Prisma.MessageFindManyArgs) {
    return prisma.message.findMany(args);
  }

  async create(args: Prisma.MessageCreateArgs) {
    return prisma.message.create(args);
  }
}
