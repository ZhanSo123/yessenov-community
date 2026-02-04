import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class SessionRepository {
  async create(args: Prisma.SessionCreateArgs) {
    return prisma.session.create(args);
  }

  async count(args?: Prisma.SessionCountArgs) {
    return prisma.session.count(args);
  }

  async findFirst(args: Prisma.SessionFindFirstArgs) {
    return prisma.session.findFirst(args);
  }
}
