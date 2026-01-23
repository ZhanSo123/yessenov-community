-- Add missing column used by the app and Prisma schema.
ALTER TABLE "User" ADD COLUMN "inviteAcceptedAt" TIMESTAMP(3);
