import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class ConversationParticipantRepository {
  async findUnique(args: Prisma.ConversationParticipantFindUniqueArgs) {
    return prisma.conversationParticipant.findUnique(args);
  }

  async findMany(args: Prisma.ConversationParticipantFindManyArgs) {
    return prisma.conversationParticipant.findMany(args);
  }

  async create(args: Prisma.ConversationParticipantCreateArgs) {
    return prisma.conversationParticipant.create(args);
  }

  async update(args: Prisma.ConversationParticipantUpdateArgs) {
    return prisma.conversationParticipant.update(args);
  }
}
