import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class ConversationRepository {
  async findUnique(args: Prisma.ConversationFindUniqueArgs) {
    return prisma.conversation.findUnique(args);
  }

  async findFirst(args: Prisma.ConversationFindFirstArgs) {
    return prisma.conversation.findFirst(args);
  }

  async create(args: Prisma.ConversationCreateArgs) {
    return prisma.conversation.create(args);
  }

  async update(args: Prisma.ConversationUpdateArgs) {
    return prisma.conversation.update(args);
  }
}
