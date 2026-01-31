-- CreateEnum
CREATE TYPE "CommunityType" AS ENUM ('OPEN', 'FACULTY', 'COURSE', 'TEACHERS');

-- AlterEnum
ALTER TYPE "CommunityModRole" ADD VALUE 'MEMBER';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEACHER';

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "courseYear" INTEGER,
ADD COLUMN     "facultyCode" TEXT,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "CommunityType" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "CommunityModerator_userId_idx" ON "CommunityModerator"("userId");
