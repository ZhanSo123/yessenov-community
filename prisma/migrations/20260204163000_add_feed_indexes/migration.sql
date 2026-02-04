CREATE INDEX "Post_feed_root_idx"
  ON "Post" ("createdAt" DESC, "id" DESC)
  WHERE "replyToId" IS NULL AND "deletedAt" IS NULL;

CREATE INDEX "Post_feed_community_idx"
  ON "Post" ("communityId", "createdAt" DESC, "id" DESC)
  WHERE "replyToId" IS NULL AND "deletedAt" IS NULL;

CREATE INDEX "Post_replies_visible_idx"
  ON "Post" ("replyToId", "createdAt", "id")
  WHERE "deletedAt" IS NULL;

CREATE INDEX "Post_profile_posts_idx"
  ON "Post" ("authorId", "createdAt" DESC, "id" DESC)
  WHERE "deletedAt" IS NULL AND "replyToId" IS NULL;

CREATE INDEX "Post_profile_replies_idx"
  ON "Post" ("authorId", "createdAt" DESC, "id" DESC)
  WHERE "deletedAt" IS NULL AND "replyToId" IS NOT NULL;
