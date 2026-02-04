-- Add expiration for self-destructing messages
ALTER TABLE "Message"
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "Message_expiresAt_idx" ON "Message"("expiresAt");
