-- Add profile fields for faculty/course.
ALTER TABLE "User"
ADD COLUMN "faculty" TEXT,
ADD COLUMN "course" INTEGER;
