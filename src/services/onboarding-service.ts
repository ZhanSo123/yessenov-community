import { type Prisma } from "@prisma/client";

import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { UserRepository } from "@/repositories/user-repository";

export type OnboardingActor = {
  id: string;
};

export type OnboardingResult =
  | { ok: true; payload: { data: unknown } }
  | { ok: false; code: "BAD_REQUEST"; status: 400 };

export class OnboardingService {
  constructor(private readonly userRepo = new UserRepository()) {}

  async completeOnboarding(params: {
    actor: OnboardingActor;
    username: string;
    faculty?: string | null;
    course?: number | null;
    bio?: string | null;
    image?: string | null;
  }): Promise<OnboardingResult> {
    const { actor, username, faculty, course, bio, image } = params;

    try {
      const data: Prisma.UserUpdateInput = {
        username,
        usernameLower: username,
        hasOnboarded: true,
      };

      if (faculty !== undefined) {
        data.faculty = faculty || null;
      }
      if (course !== undefined) {
        data.course = course ?? null;
      }
      if (bio !== undefined) {
        data.bio = bio || null;
      }
      if (image !== undefined) {
        data.image = image || null;
      }

      const updated = await this.userRepo.update({
        where: { id: actor.id },
        data,
      });

      return { ok: true, payload: { data: updated } };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return { ok: false, code: "BAD_REQUEST", status: 400 };
      }

      throw error;
    }
  }
}
