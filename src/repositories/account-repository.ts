import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export class AccountRepository {
  async count(args?: Prisma.AccountCountArgs) {
    return prisma.account.count(args);
  }
}
