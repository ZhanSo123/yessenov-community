-- Add encryption mode to conversations
CREATE TYPE "EncryptionMode" AS ENUM ('CLOUD', 'E2E');

ALTER TABLE "Conversation"
  ADD COLUMN "encryptionMode" "EncryptionMode" NOT NULL DEFAULT 'CLOUD';
