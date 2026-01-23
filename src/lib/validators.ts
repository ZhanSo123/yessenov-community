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
          | "INVALID_BIO";
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

  return {
    ok: true,
    data: {
      username: usernameResult.username,
      usernameLower: usernameResult.usernameLower,
      displayName,
      bio,
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
  role: z.enum(["USER", "MOD", "ADMIN"]),
});

export const CommunityModRoleSchema = z.enum(["MOD", "OWNER"]);

export const CommunityModSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    username: z.string().trim().min(1).max(32).optional(),
    role: CommunityModRoleSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.userId || value.email || value.username),
    { message: "Missing moderator identifier" }
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

export const RegisterSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  name: z.string().trim().max(80).optional(),
});

export const OnboardingSchema = z.object({
  username: z.string().trim().min(3).max(20).regex(/^@?[a-z0-9_]+$/),
  age: z.coerce.number().int().min(13).max(120).optional(),
  faculty: z.string().trim().max(80).optional(),
  course: z.coerce.number().int().min(1).max(6).optional(),
  bio: z.string().trim().max(160).optional(),
  image: z.string().trim().max(2000000).optional(),
});

export const PhoneStartSchema = z.object({
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/),
});

export const PhoneVerifySchema = z.object({
  phoneE164: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/),
  code: z.string().trim().regex(/^\d{6}$/),
});
