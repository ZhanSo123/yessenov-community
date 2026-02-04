import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class UserDeviceRepository {
  async findUnique(args: Prisma.UserDeviceFindUniqueArgs) {
    return prisma.userDevice.findUnique(args);
  }

  async create(args: Prisma.UserDeviceCreateArgs) {
    return prisma.userDevice.create(args);
  }

  async update(args: Prisma.UserDeviceUpdateArgs) {
    return prisma.userDevice.update(args);
  }
}
