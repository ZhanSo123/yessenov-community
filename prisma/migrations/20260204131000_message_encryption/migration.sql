-- Add encrypted content fields for DM messages
ALTER TABLE "Message"
  ADD COLUMN "contentCiphertext" TEXT,
  ADD COLUMN "contentIv" TEXT,
  ADD COLUMN "contentTag" TEXT,
  ADD COLUMN "contentKeyId" TEXT;

-- Allow legacy plaintext to be nullable
ALTER TABLE "Message"
  ALTER COLUMN "content" DROP NOT NULL;
