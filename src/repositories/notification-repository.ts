import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class NotificationRepository {
  async findFirst(args: Prisma.NotificationFindFirstArgs) {
    return prisma.notification.findFirst(args);
  }

  async findMany(args: Prisma.NotificationFindManyArgs) {
    return prisma.notification.findMany(args);
  }

  async create(args: Prisma.NotificationCreateArgs) {
    return prisma.notification.create(args);
  }

  async count(args: Prisma.NotificationCountArgs) {
    return prisma.notification.count(args);
  }

  async updateMany(args: Prisma.NotificationUpdateManyArgs) {
    return prisma.notification.updateMany(args);
  }
}
