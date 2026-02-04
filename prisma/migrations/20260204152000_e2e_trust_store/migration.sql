-- E2E trust store for safety verification
CREATE TABLE "E2eTrust" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "peerDeviceId" TEXT NOT NULL,
  "peerIdentityKeyHash" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "E2eTrust_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "E2eTrust_userId_peerDeviceId_key" ON "E2eTrust"("userId", "peerDeviceId");
CREATE INDEX "E2eTrust_userId_verifiedAt_idx" ON "E2eTrust"("userId", "verifiedAt");

ALTER TABLE "E2eTrust" ADD CONSTRAINT "E2eTrust_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "E2eTrust" ADD CONSTRAINT "E2eTrust_peerDeviceId_fkey" FOREIGN KEY ("peerDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
