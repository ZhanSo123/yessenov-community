-- E2E key tables for secret chats
CREATE TABLE "UserDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserIdentityKey" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserIdentityKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSignedPreKey" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),

  CONSTRAINT "UserSignedPreKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserOneTimePreKey" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3),

  CONSTRAINT "UserOneTimePreKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserIdentityKey_deviceId_key" ON "UserIdentityKey"("deviceId");
CREATE UNIQUE INDEX "UserSignedPreKey_deviceId_keyId_key" ON "UserSignedPreKey"("deviceId", "keyId");
CREATE UNIQUE INDEX "UserOneTimePreKey_deviceId_keyId_key" ON "UserOneTimePreKey"("deviceId", "keyId");

CREATE INDEX "UserDevice_userId_lastSeenAt_idx" ON "UserDevice"("userId", "lastSeenAt");
CREATE INDEX "UserIdentityKey_createdAt_idx" ON "UserIdentityKey"("createdAt");
CREATE INDEX "UserSignedPreKey_deviceId_createdAt_idx" ON "UserSignedPreKey"("deviceId", "createdAt");
CREATE INDEX "UserOneTimePreKey_deviceId_createdAt_idx" ON "UserOneTimePreKey"("deviceId", "createdAt");
CREATE INDEX "UserOneTimePreKey_deviceId_consumedAt_idx" ON "UserOneTimePreKey"("deviceId", "consumedAt");

ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserIdentityKey" ADD CONSTRAINT "UserIdentityKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSignedPreKey" ADD CONSTRAINT "UserSignedPreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserOneTimePreKey" ADD CONSTRAINT "UserOneTimePreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
