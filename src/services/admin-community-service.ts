import { type Role } from "@/lib/auth";
import { getInfrastructure } from "@/infrastructure";
import { CommunityMemberRepository } from "@/repositories/community-member-repository";
import { CommunityRepository } from "@/repositories/community-repository";

export type AdminCommunityActor = { id: string; role: Role };

export type AdminCommunityListResult =
  | { ok: true; payload: { data: unknown[] } }
  | { ok: false; code: "FORBIDDEN"; status: 403 };

export type AdminCommunityCreateResult =
  | { ok: true; payload: { data: unknown } }
  | { ok: false; code: "FORBIDDEN"; status: 403 };

export class AdminCommunityService {
  constructor(
    private readonly communityRepo = new CommunityRepository(),
    private readonly communityMemberRepo = new CommunityMemberRepository(),
    private readonly cache = getInfrastructure().cache
  ) {}

  async listCommunities(params: {
    actor: AdminCommunityActor;
    scope: Array<{ communityId: number; role: string }> | null;
  }): Promise<AdminCommunityListResult> {
    const { actor, scope } = params;

    if (actor.role !== "MOD" && actor.role !== "ADMIN") {
      const owned = (scope ?? []).filter((item) => item.role === "OWNER");
      if (owned.length === 0) {
        return { ok: false, code: "FORBIDDEN", status: 403 };
      }

      const communities = await this.communityRepo.findMany({
        where: { id: { in: owned.map((item) => item.communityId) } },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { posts: true, members: true } } },
      });

      return { ok: true, payload: { data: communities } };
    }

    const communities = await this.communityRepo.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { posts: true, members: true } } },
    });

    return { ok: true, payload: { data: communities } };
  }

  async createCommunity(params: {
    actor: AdminCommunityActor;
    slug: string;
    title: string;
    description: string;
    type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
    isPrivate: boolean;
    facultyCode: string | null;
    courseYear: number | null;
  }): Promise<AdminCommunityCreateResult> {
    const { actor } = params;

    if (actor.role !== "ADMIN") {
      return { ok: false, code: "FORBIDDEN", status: 403 };
    }

    const community = await this.communityRepo.create({
      data: {
        slug: params.slug,
        title: params.title,
        description: params.description,
        type: params.type,
        isPrivate: params.isPrivate,
        facultyCode: params.facultyCode,
        courseYear: params.courseYear,
      },
    });

    await this.communityMemberRepo
      .create({
        data: {
          communityId: community.id,
          userId: actor.id,
          role: "OWNER",
        },
      })
      .catch(() => null);

    await this.cache.del("communities:");
    await this.cache.del("community-access:");

    return { ok: true, payload: { data: community } };
  }
}
