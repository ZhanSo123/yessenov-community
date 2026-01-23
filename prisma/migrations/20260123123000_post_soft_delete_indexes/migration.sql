-- CreateIndex
CREATE INDEX "Post_deletedAt_idx" ON "Post"("deletedAt");

-- CreateIndex
CREATE INDEX "Post_authorId_deletedAt_idx" ON "Post"("authorId", "deletedAt");
