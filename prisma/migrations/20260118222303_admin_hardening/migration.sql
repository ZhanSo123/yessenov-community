-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('SPAM', 'HARASSMENT', 'ILLEGAL', 'OTHER');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "category" "ReportCategory",
ADD COLUMN     "severity" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shadowBanReason" TEXT,
ADD COLUMN     "shadowBannedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
