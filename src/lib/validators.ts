import { z } from "zod";

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
  username: z.string().trim().min(3).max(20).regex(/^[a-z0-9_]+$/),
  age: z.coerce.number().int().min(13).max(120).optional(),
  bio: z.string().trim().max(160).optional(),
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
