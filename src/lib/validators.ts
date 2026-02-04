import { z } from "zod";

const RESERVED_USERNAMES = new Set([
  "admin",
  "root",
  "support",
  "help",
  "me",
  "settings",
  "api",
  "auth",
  "u",
  "p",
  "post",
  "posts",
]);

type UsernameValidationResult =
  | { ok: true; username: string; usernameLower: string }
  | { ok: false; error: { code: "INVALID_USERNAME" | "RESERVED_USERNAME"; message: string } };

export const validateUsername = (raw: unknown): UsernameValidationResult => {
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_USERNAME", message: "Username must be a string." },
    };
  }

  let username = raw.trim();
  if (username.startsWith("@")) {
    username = username.slice(1);
  }

  if (username.length < 3 || username.length > 20) {
    return {
      ok: false,
      error: { code: "INVALID_USERNAME", message: "Username length is invalid." },
    };
  }

  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
    return {
      ok: false,
      error: { code: "INVALID_USERNAME", message: "Username has invalid characters." },
    };
  }

  if (/^[._]/.test(username) || /[._]$/.test(username)) {
    return {
      ok: false,
      error: { code: "INVALID_USERNAME", message: "Username format is invalid." },
    };
  }

  if (username.includes("..") || username.includes("__")) {
    return {
      ok: false,
      error: { code: "INVALID_USERNAME", message: "Username format is invalid." },
    };
  }

  const usernameLower = username.toLowerCase();
  if (RESERVED_USERNAMES.has(usernameLower)) {
    return {
      ok: false,
      error: { code: "RESERVED_USERNAME", message: "Username is reserved." },
    };
  }

  return { ok: true, username, usernameLower };
};

type ProfileValidationResult =
  | {
      ok: true;
      data: {
        username: string;
        usernameLower: string;
        displayName: string | null;
        bio: string | null;
        image?: string | null;
        faculty?: string | null;
        course?: number | null;
        interests?: string[];
      };
    }
  | {
      ok: false;
      error: {
        code:
          | "INVALID_PAYLOAD"
          | "INVALID_USERNAME"
          | "RESERVED_USERNAME"
          | "INVALID_DISPLAY_NAME"
          | "INVALID_BIO"
          | "INVALID_IMAGE"
          | "INVALID_FACULTY"
          | "INVALID_COURSE"
          | "INVALID_INTERESTS";
        message: string;
      };
    };

export const validateProfile = (payload: unknown): ProfileValidationResult => {
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "Payload is invalid." },
    };
  }

  const record = payload as Record<string, unknown>;
  const usernameResult = validateUsername(record.username);
  if (!usernameResult.ok) {
    return { ok: false, error: usernameResult.error };
  }

  let displayName: string | null = null;
  if (record.displayName !== undefined) {
    if (typeof record.displayName !== "string") {
      return {
        ok: false,
        error: { code: "INVALID_DISPLAY_NAME", message: "Display name is invalid." },
      };
    }
    const trimmed = record.displayName.trim();
    if (trimmed.length > 40) {
      return {
        ok: false,
        error: { code: "INVALID_DISPLAY_NAME", message: "Display name is too long." },
      };
    }
    displayName = trimmed.length > 0 ? trimmed : null;
  }

  let bio: string | null = null;
  if (record.bio !== undefined) {
    if (typeof record.bio !== "string") {
      return {
        ok: false,
        error: { code: "INVALID_BIO", message: "Bio is invalid." },
      };
    }
    const trimmed = record.bio.trim();
    if (trimmed.length > 160) {
      return {
        ok: false,
        error: { code: "INVALID_BIO", message: "Bio is too long." },
      };
    }
    bio = trimmed.length > 0 ? trimmed : null;
  }

  let image: string | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(record, "image")) {
    if (record.image === null) {
      image = null;
    } else if (typeof record.image === "string") {
      const trimmed = record.image.trim();
      if (!trimmed) {
        image = null;
      } else {
        const isDataImage = trimmed.startsWith("data:image/");
        const isHttp = /^https?:\/\//.test(trimmed);
        if (!isDataImage && !isHttp) {
          return {
            ok: false,
            error: { code: "INVALID_IMAGE", message: "Image format is invalid." },
          };
        }
        if (trimmed.length > 200_000) {
          return {
            ok: false,
            error: { code: "INVALID_IMAGE", message: "Image is too large." },
          };
        }
        image = trimmed;
      }
    } else {
      return {
        ok: false,
        error: { code: "INVALID_IMAGE", message: "Image is invalid." },
      };
    }
  }

  let faculty: string | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(record, "faculty")) {
    if (record.faculty === null) {
      faculty = null;
    } else if (typeof record.faculty === "string") {
      const trimmed = record.faculty.trim();
      if (trimmed.length > 80) {
        return {
          ok: false,
          error: { code: "INVALID_FACULTY", message: "Faculty is too long." },
        };
      }
      faculty = trimmed.length > 0 ? trimmed : null;
    } else {
      return {
        ok: false,
        error: { code: "INVALID_FACULTY", message: "Faculty is invalid." },
      };
    }
  }

  let course: number | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(record, "course")) {
    if (record.course === null || record.course === "") {
      course = null;
    } else if (typeof record.course === "number" || typeof record.course === "string") {
      const parsed = Number(record.course);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
        return {
          ok: false,
          error: { code: "INVALID_COURSE", message: "Course is invalid." },
        };
      }
      course = parsed;
    } else {
      return {
        ok: false,
        error: { code: "INVALID_COURSE", message: "Course is invalid." },
      };
    }
  }

  let interests: string[] | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(record, "interests")) {
    const raw = record.interests;
    let values: string[] = [];
    if (typeof raw === "string") {
      values = raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (Array.isArray(raw)) {
      values = raw
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (raw === null) {
      values = [];
    } else {
      return {
        ok: false,
        error: { code: "INVALID_INTERESTS", message: "Interests are invalid." },
      };
    }

    const unique = Array.from(new Set(values));
    if (unique.length > 10) {
      return {
        ok: false,
        error: { code: "INVALID_INTERESTS", message: "Too many interests." },
      };
    }
    if (unique.some((item) => item.length > 24)) {
      return {
        ok: false,
        error: { code: "INVALID_INTERESTS", message: "Interest too long." },
      };
    }
    interests = unique;
  }

  return {
    ok: true,
    data: {
      username: usernameResult.username,
      usernameLower: usernameResult.usernameLower,
      displayName,
      bio,
      image,
      faculty,
      course,
      interests,
    },
  };
};

export const PostCreateSchema = z.object({
  content: z.string().trim().min(1).max(500),
  replyToId: z.number().int().optional(),
  communityId: z.number().int().optional(),
  communitySlug: z.string().trim().min(1).max(64).optional(),
});

export const LikeToggleSchema = z.object({
  postId: z.number().int(),
});

export const FollowToggleSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_]+$/),
});

export const DmStartSchema = z.object({
  username: z.string().trim().min(1).max(32),
});

export const DmSendSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});

export const ReportCategorySchema = z.enum([
  "SPAM",
  "HARASSMENT",
  "ILLEGAL",
  "OTHER",
]);

export const ReportCreateSchema = z.object({
  postId: z.number().int(),
  reason: z.string().trim().min(1).max(200),
  category: ReportCategorySchema.optional(),
  severity: z.number().int().min(1).max(3).optional(),
});

export const ReportStatusSchema = z.enum(["OPEN", "RESOLVED", "REJECTED"]);

export const ReportResolveSchema = z.object({
  status: z.enum(["RESOLVED", "REJECTED"]),
  note: z.string().trim().max(200).optional(),
});

export const AdminPostDeleteSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const UserBanSchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional(),
  reason: z.string().trim().max(200).optional(),
});

export const ShadowBanSchema = z.object({
  reason: z.string().trim().min(1).max(200),
});

export const UserRoleSchema = z.object({
  role: z.enum(["USER", "TEACHER", "MOD", "ADMIN"]),
});

export const CommunityMemberRoleSchema = z.enum(["MEMBER", "MOD", "OWNER"]);

export const CommunityMemberSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    username: z.string().trim().min(1).max(32).optional(),
    role: CommunityMemberRoleSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.userId || value.email || value.username),
    { message: "Missing member identifier" }
  );

export const BulkActionSchema = z.object({
  action: z.enum([
    "POST_DELETE",
    "POST_RESTORE",
    "USER_BAN",
    "USER_UNBAN",
    "REPORT_RESOLVE",
    "REPORT_REJECT",
  ]),
  ids: z.array(z.union([z.string(), z.number()])),
  reason: z.string().trim().min(1).max(200).optional(),
  days: z.coerce.number().int().positive().max(365).optional(),
  note: z.string().trim().max(200).optional(),
});

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  cursor: z.string().optional(),
});

export const SearchUsersSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().positive().max(20).optional(),
  cursor: z.string().optional(),
});

export const AppealCreateSchema = z.object({
  targetType: z.string().trim().min(1).max(32),
  targetId: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(1).max(500),
});

export const AppealResolveSchema = z.object({
  status: z.enum(["APPROVED", "DENIED"]),
  note: z.string().trim().max(200).optional(),
});

export const FeedbackCreateSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  currentPath: z.string().trim().min(1).max(200),
});

export const PinPostSchema = z.object({
  postId: z.number().int().nullable(),
});

export const CommunityCreateSchema = z
  .object({
    slug: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(128),
    description: z.string().trim().max(500).optional().default(""),
    type: z.enum(["OPEN", "FACULTY", "COURSE", "TEACHERS"]).optional(),
    isPrivate: z.boolean().optional(),
    facultyCode: z.string().trim().max(16).optional(),
    courseYear: z.coerce.number().int().min(1).max(6).optional(),
  })
  .superRefine((data, ctx) => {
    const type = data.type ?? "OPEN";
    if (type === "FACULTY" && !data.facultyCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FACULTY_CODE_REQUIRED",
        path: ["facultyCode"],
      });
    }
    if (type === "COURSE") {
      if (!data.facultyCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "FACULTY_CODE_REQUIRED",
          path: ["facultyCode"],
        });
      }
      if (!data.courseYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "COURSE_YEAR_REQUIRED",
          path: ["courseYear"],
        });
      }
    }
  });

export const OnboardingSchema = z.object({
  username: z.string().trim().min(3).max(20).regex(/^@?[a-z0-9_]+$/),
  faculty: z.string().trim().max(80).optional(),
  course: z.coerce.number().int().min(1).max(6).optional(),
  bio: z.string().trim().max(160).optional(),
  image: z.string().trim().max(2000000).optional(),
});
