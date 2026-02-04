import { prisma } from "@/lib/prisma";
import { AccountRepository } from "@/repositories/account-repository";
import { SessionRepository } from "@/repositories/session-repository";
import { UserRepository } from "@/repositories/user-repository";

export class DevAuthDbService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly accountRepo = new AccountRepository(),
    private readonly sessionRepo = new SessionRepository()
  ) {}

  async getSummary() {
    const [userCount, accountCount, sessionCount] = await prisma.$transaction([
      this.userRepo.count({}),
      this.accountRepo.count({}),
      this.sessionRepo.count({}),
    ]);

    const latestSession = await this.sessionRepo.findFirst({
      orderBy: { expires: "desc" },
      select: { id: true, userId: true, expires: true },
    });

    return {
      counts: {
        users: userCount,
        accounts: accountCount,
        sessions: sessionCount,
      },
      latestSession,
    };
  }
}
