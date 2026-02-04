import { apiError, apiSuccess } from "@/lib/api-errors";
import { getCommunityScope, requireRoleApi, requireUserApi } from "@/lib/auth";
import { CommunityCreateSchema } from "@/lib/validators";
import { AdminCommunityService } from "@/services/admin-community-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await requireUserApi();
    const scope = await getCommunityScope(actor);

    const service = new AdminCommunityService();
    const result = await service.listCommunities({ actor, scope });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRoleApi("ADMIN");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("BAD_REQUEST", 400);
    }

    const parsed = CommunityCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400);
    }

    const type = parsed.data.type ?? "OPEN";
    const isPrivate =
      type === "TEACHERS" ? true : parsed.data.isPrivate ?? false;
    const facultyCode =
      type === "FACULTY" || type === "COURSE"
        ? parsed.data.facultyCode
          ? parsed.data.facultyCode.trim().toUpperCase()
          : null
        : null;
    const courseYear = type === "COURSE" ? parsed.data.courseYear ?? null : null;

    const service = new AdminCommunityService();
    const result = await service.createCommunity({
      actor,
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      type,
      isPrivate,
      facultyCode,
      courseYear,
    });

    if (!result.ok) {
      return apiError(result.code, result.status);
    }

    return apiSuccess(result.payload, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return apiError("INTERNAL_ERROR", 500);
  }
}
