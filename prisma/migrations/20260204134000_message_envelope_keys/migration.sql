-- Add envelope key wrapping fields for DM messages
ALTER TABLE "Message"
  ADD COLUMN "contentDekWrapped" TEXT,
  ADD COLUMN "contentDekIv" TEXT,
  ADD COLUMN "contentDekTag" TEXT;
