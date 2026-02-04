import { UserRepository } from "@/repositories/user-repository";

export type InviteAcceptActor = {
  id: string;
  role: "USER" | "TEACHER" | "MOD" | "ADMIN";
};

export type InviteAcceptResult =
  | { ok: true; payload: { ok: true; userId: string } }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

export class InviteAcceptService {
  constructor(private readonly userRepo = new UserRepository()) {}

  async acceptInvite(params: {
    actor: InviteAcceptActor;
    inviteOnly: boolean;
    code: string | null;
    allowedCodes: string[];
  }): Promise<InviteAcceptResult> {
    const { actor, inviteOnly, code, allowedCodes } = params;

    if (!inviteOnly) {
      return { ok: true, payload: { ok: true, userId: actor.id } };
    }

    if (!code) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    if (!allowedCodes.includes(code)) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    if (actor.role === "MOD" || actor.role === "ADMIN") {
      return { ok: true, payload: { ok: true, userId: actor.id } };
    }

    await this.userRepo.update({
      where: { id: actor.id },
      data: { inviteAcceptedAt: new Date() },
    });

    return { ok: true, payload: { ok: true, userId: actor.id } };
  }
}
