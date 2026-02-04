import { type Prisma } from "@prisma/client";

import { type Role } from "@/lib/auth";
import { getInfrastructure } from "@/infrastructure";
import { CommunityMemberRepository } from "@/repositories/community-member-repository";
import { CommunityRepository } from "@/repositories/community-repository";
import { PostRepository } from "@/repositories/post-repository";
import { UserRepository } from "@/repositories/user-repository";

export type MeProfileUser = {
  id: string;
  email: string | null;
  username: string | null;
  usernameLower: string | null;
  displayName: string | null;
  bio: string | null;
  image: string | null;
  interests: string[] | null;
  hasOnboarded: boolean;
  faculty: string | null;
  course: number | null;
  role: Role;
};

export type MeProfileUpdateInput = {
  username: string | null;
  usernameLower: string | null;
  displayName: string | null;
  bio: string | null;
  image?: string | null;
  faculty?: string | null;
  course?: number | null;
  interests?: string[];
};

export type MeProfileResult =
  | {
      ok: true;
      payload: {
        data: {
          user: {
            id: string;
            email: string | null;
            username: string | null;
            displayName: string | null;
            bio: string | null;
            image: string | null;
            interests: string[] | null;
            hasOnboarded: boolean;
            faculty: string | null;
            course: number | null;
          };
        };
      };
    }
  | { ok: false; code: "BAD_REQUEST" | "CONFLICT"; status: 400 | 409; message?: string };

export type MeProfileUpdateResult =
  | { ok: true; payload: { data: unknown } }
  | { ok: false; code: "BAD_REQUEST" | "CONFLICT"; status: 400 | 409; message?: string };

export type MePinResult =
  | { ok: true; payload: { data: { pinnedPostId: number | null } } }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST"; status: 404 | 403 | 400; message?: string };

export class MeProfileService {
  constructor(
    private readonly userRepo = new UserRepository(),
    private readonly postRepo = new PostRepository(),
    private readonly communityRepo = new CommunityRepository(),
    private readonly communityMemberRepo = new CommunityMemberRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  getProfile(user: MeProfileUser): MeProfileResult {
    return {
      ok: true,
      payload: {
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            displayName: user.displayName,
            bio: user.bio,
            image: user.image,
            interests: user.interests,
            hasOnboarded: user.hasOnboarded,
            faculty: user.faculty,
            course: user.course,
          },
        },
      },
    };
  }

  async updateProfile(params: {
    user: MeProfileUser;
    data: MeProfileUpdateInput;
  }): Promise<MeProfileUpdateResult> {
    const { user, data } = params;

    if (
      user.username &&
      user.hasOnboarded &&
      user.usernameLower &&
      user.usernameLower !== data.usernameLower
    ) {
      return { ok: false, code: "BAD_REQUEST", status: 400, message: "USERNAME_LOCKED" };
    }

    if (!data.usernameLower) {
      return { ok: false, code: "BAD_REQUEST", status: 400 };
    }

    const existing = await this.userRepo.findUnique({
      where: { usernameLower: data.usernameLower },
      select: { id: true },
    });

    if (existing && existing.id !== user.id) {
      return { ok: false, code: "CONFLICT", status: 409, message: "USERNAME_TAKEN" };
    }

    const updateData: Prisma.UserUpdateInput = {
      username: data.username,
      usernameLower: data.usernameLower,
      displayName: data.displayName,
      bio: data.bio,
      image: data.image,
      hasOnboarded: true,
    };

    if (data.faculty !== undefined) {
      updateData.faculty = data.faculty;
    }
    if (data.course !== undefined) {
      updateData.course = data.course;
    }
    if (data.interests !== undefined) {
      updateData.interests = data.interests;
    }

    const updated = await this.userRepo.update({
      where: { id: user.id },
      data: updateData,
      select: {
        username: true,
        displayName: true,
        bio: true,
        image: true,
        faculty: true,
        course: true,
        interests: true,
      },
    });

    if (user.usernameLower && user.usernameLower !== data.usernameLower) {
      await this.cache.del(`user-by-username:${user.usernameLower}`);
      await this.cache.del(`user-by-username:${data.usernameLower}`);
      await this.cache.del(`profile-posts:${user.usernameLower}:`);
      await this.cache.del(`profile-replies:${user.usernameLower}:`);
      await this.cache.del(`profile-header:${user.usernameLower}:`);
      await this.cache.del(`profile-header:${data.usernameLower}:`);
    }

    const shouldSyncCommunities =
      data.faculty !== undefined || data.course !== undefined;

    if (shouldSyncCommunities) {
      const facultyValue =
        data.faculty !== undefined ? data.faculty : user.faculty;
      const courseValue = data.course !== undefined ? data.course : user.course;
      const facultyCode = facultyValue ? facultyValue.trim().toUpperCase() : null;

      const orFilters: Prisma.CommunityWhereInput[] = [];

      if (facultyCode) {
        orFilters.push({
          type: "FACULTY",
          isPrivate: true,
          facultyCode,
        });
      }

      if (courseValue) {
        if (facultyCode) {
          orFilters.push({
            type: "COURSE",
            isPrivate: true,
            courseYear: courseValue,
            facultyCode,
          });
          orFilters.push({
            type: "COURSE",
            isPrivate: true,
            courseYear: courseValue,
            facultyCode: null,
          });
        } else {
          orFilters.push({
            type: "COURSE",
            isPrivate: true,
            courseYear: courseValue,
          });
        }
      }

      if (user.role === "TEACHER") {
        orFilters.push({ type: "TEACHERS", isPrivate: true });
      }

      if (orFilters.length > 0) {
        const communities = await this.communityRepo.findMany({
          where: { OR: orFilters },
          select: { id: true },
        });

        if (communities.length > 0) {
          await this.communityMemberRepo.createMany({
            data: communities.map((community) => ({
              communityId: community.id,
              userId: user.id,
              role: "MEMBER",
            })),
            skipDuplicates: true,
          });
        }
      }

      await this.cache.del(`community-access:${user.id}:`);
    }

    return { ok: true, payload: { data: updated } };
  }

  async updatePinnedPost(params: {
    user: MeProfileUser;
    postId: number | null;
  }): Promise<MePinResult> {
    const { user, postId } = params;

    if (postId === null) {
      const updated = await this.userRepo.update({
        where: { id: user.id },
        data: { pinnedPostId: null },
        select: { pinnedPostId: true },
      });
      return { ok: true, payload: { data: updated } };
    }

    const post = await this.postRepo.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, replyToId: true, deletedAt: true },
    });

    if (!post) {
      return { ok: false, code: "NOT_FOUND", status: 404 };
    }

    if (post.authorId !== user.id) {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    if (post.replyToId !== null || post.deletedAt) {
      return { ok: false, code: "BAD_REQUEST", status: 400, message: "INVALID_PIN" };
    }

    const updated = await this.userRepo.update({
      where: { id: user.id },
      data: { pinnedPostId: postId },
      select: { pinnedPostId: true },
    });

    return { ok: true, payload: { data: updated } };
  }
}
