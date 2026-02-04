CREATE INDEX "User_bannedUntil_idx" ON "User"("bannedUntil");
CREATE INDEX "User_shadowBannedAt_idx" ON "User"("shadowBannedAt");
CREATE INDEX "Report_status_severity_createdAt_idx" ON "Report"("status", "severity", "createdAt");
CREATE INDEX "ModerationAction_source_createdAt_idx" ON "ModerationAction"("source", "createdAt");
