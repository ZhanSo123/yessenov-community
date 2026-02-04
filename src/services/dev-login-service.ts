import { UserRepository } from "@/repositories/user-repository";
import { SessionRepository } from "@/repositories/session-repository";

const DEV_EMAIL = "dev@local.test";
const DEV_NAME = "Dev User";
const DEV_USERNAME = "dev";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class DevLoginService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly sessionRepo = new SessionRepository()
  ) {}

  private async resolveUsername() {
    const candidates = [DEV_USERNAME, "dev2", "dev3", "dev4", "dev5"];
    for (const candidate of candidates) {
      const existing = await this.userRepo.findUnique({
        where: { usernameLower: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    return null;
  }

  private async ensureDevUser() {
    const existing = await this.userRepo.findUnique({
      where: { email: DEV_EMAIL },
    });

    if (existing) {
      return existing;
    }

    const username = await this.resolveUsername();

    return this.userRepo.create({
      data: {
        email: DEV_EMAIL,
        name: DEV_NAME,
        username,
        usernameLower: username ? username.toLowerCase() : null,
        hasOnboarded: true,
      },
    });
  }

  async createSession() {
    const user = await this.ensureDevUser();
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessionRepo.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    return { sessionToken, expires };
  }
}
